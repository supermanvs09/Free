package correlation

import "testing"

func TestResourceType(t *testing.T) {
	for arn, want := range map[string]string{
		"arn:aws:s3:::acme-web-assets":                           "bucket",
		"arn:aws:s3:::acme-web-assets/*":                         "object",
		"arn:aws:dynamodb:us-east-1:1:table/orders":              "table",
		"arn:aws:secretsmanager:us-east-1:1:secret:prod/db-AbCd": "secret",
		"arn:aws:iam::1:role/web":                                "role",
		"arn:aws:sqs:us-east-1:1:order-events":                   "queue",
		"arn:aws:sns:us-east-1:1:alerts":                         "topic",
		"arn:aws:lambda:us-east-1:1:function:fn":                 "function",
	} {
		if got := resourceType(arn); got != want {
			t.Errorf("%s: %s, want %s", arn, got, want)
		}
	}
}
