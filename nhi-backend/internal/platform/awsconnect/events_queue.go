package awsconnect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

// ErrEventQueueNotConfigured: no SQS queue is set (aws_integration.event_queue_url).
var ErrEventQueueNotConfigured = errors.New("event queue is not configured")

var sqsRegionRE = regexp.MustCompile(`^https://sqs\.([a-z0-9-]+)\.`)

const (
	queuePeekRounds = 3  // receive calls per check
	queuePeekBatch  = 10 // SQS maximum per call
	queuePeekWaitS  = 2  // long-poll seconds per call

	queuePollRounds = 5 // receive calls per poll of the connection check (up to 50 messages)
	queuePollWaitS  = 1 // long-poll seconds per call: a poll stays well inside its interval
)

// PeekEventsFrom looks at a few messages of the central event queue and
// reports whether one came from accountID, and how many messages it saw. It only peeks: messages are never
// deleted and are made visible again at once (VisibilityTimeout 0), so the
// pipeline that consumes the queue loses nothing. Each message body is the
// EventBridge event JSON, whose top-level "account" is set by AWS and cannot
// be forged by the sender.
func (c *Client) PeekEventsFrom(ctx context.Context, p Platform, accountID string) (found bool, seen int, err error) {
	if c.eventQueueURL == "" {
		return false, 0, ErrEventQueueNotConfigured
	}
	if !accountIDRE.MatchString(accountID) {
		return false, 0, fmt.Errorf("invalid account id")
	}
	cfg := c.platformConfig(p)
	if m := sqsRegionRE.FindStringSubmatch(c.eventQueueURL); m != nil {
		cfg.Region = m[1] // the queue's own region, which may differ from the bus's
	}
	client := sqs.NewFromConfig(cfg)
	for i := 0; i < queuePeekRounds; i++ {
		out, err := client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(c.eventQueueURL),
			MaxNumberOfMessages: queuePeekBatch,
			VisibilityTimeout:   0,
			WaitTimeSeconds:     queuePeekWaitS,
		})
		if err != nil {
			return false, seen, fmt.Errorf("peek event queue: %w", err)
		}
		seen += len(out.Messages)
		if messagesFromAccount(out.Messages, accountID) {
			return true, seen, nil
		}
	}
	return false, seen, nil
}

// EventPoll is what one round of reading the queue found for an account.
type EventPoll struct {
	Regions map[string]int // events from the account, by the region they came from
	Seen    int            // messages read in all, from every account
}

// PollEventsFrom reads one round of the central event queue (a few long-poll
// receives) and reports, by region, the events from accountID among them. It
// only peeks, as PeekEventsFrom does: nothing is deleted and every message is
// visible again at once, so the pipeline that consumes the queue loses
// nothing. Called every few seconds by the connection check until an event
// from every region has been seen, or its time runs out.
func (c *Client) PollEventsFrom(ctx context.Context, p Platform, accountID string) (EventPoll, error) {
	out := EventPoll{Regions: map[string]int{}}
	if c.eventQueueURL == "" {
		return out, ErrEventQueueNotConfigured
	}
	if !accountIDRE.MatchString(accountID) {
		return out, fmt.Errorf("invalid account id")
	}
	cfg := c.platformConfig(p)
	if m := sqsRegionRE.FindStringSubmatch(c.eventQueueURL); m != nil {
		cfg.Region = m[1]
	}
	client := sqs.NewFromConfig(cfg)
	for i := 0; i < queuePollRounds; i++ {
		res, err := client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(c.eventQueueURL),
			MaxNumberOfMessages: queuePeekBatch,
			VisibilityTimeout:   0,
			WaitTimeSeconds:     queuePollWaitS,
		})
		if err != nil {
			return out, fmt.Errorf("poll event queue: %w", classify(err))
		}
		out.Seen += len(res.Messages)
		for _, m := range res.Messages {
			if m.Body == nil {
				continue
			}
			if account, region := bodyAccountRegion(*m.Body); account == accountID && region != "" {
				out.Regions[region]++
			}
		}
		if len(res.Messages) == 0 {
			break // long poll came back empty: nothing more to read this round
		}
	}
	return out, nil
}

// bodyAccountRegion reads "account" and "region" from an EventBridge event,
// also when wrapped in an SNS-style {"Message": "<event json>"} envelope. Both
// are set by AWS and cannot be forged by the sender.
func bodyAccountRegion(body string) (account, region string) {
	var ev struct {
		Account string `json:"account"`
		Region  string `json:"region"`
		Message string `json:"Message"`
	}
	if json.Unmarshal([]byte(body), &ev) != nil {
		return "", ""
	}
	if ev.Account == "" && ev.Message != "" {
		var inner struct {
			Account string `json:"account"`
			Region  string `json:"region"`
		}
		_ = json.Unmarshal([]byte(ev.Message), &inner)
		return inner.Account, inner.Region
	}
	return ev.Account, ev.Region
}

func messagesFromAccount(msgs []sqstypes.Message, accountID string) bool {
	for _, m := range msgs {
		if m.Body != nil && bodyAccount(*m.Body) == accountID {
			return true
		}
	}
	return false
}

// bodyAccount reads "account" from an EventBridge event, also when it is
// wrapped in an SNS-style {"Message": "<event json>"} envelope.
func bodyAccount(body string) string {
	var ev struct {
		Account string `json:"account"`
		Message string `json:"Message"`
	}
	if json.Unmarshal([]byte(body), &ev) != nil {
		return ""
	}
	if ev.Account == "" && ev.Message != "" {
		var inner struct {
			Account string `json:"account"`
		}
		_ = json.Unmarshal([]byte(ev.Message), &inner)
		return inner.Account
	}
	return ev.Account
}
