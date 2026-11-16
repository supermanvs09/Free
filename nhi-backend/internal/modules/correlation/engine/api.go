package engine

import "regexp"

// arnRe accepts ARNs only; it keeps junk out of queries and logs.
var arnRe = regexp.MustCompile(`^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:[0-9]*:[^\s]+$`)

// ValidARN reports whether s is a well-formed AWS ARN of at most 2048 characters.
func ValidARN(s string) bool { return len(s) <= 2048 && arnRe.MatchString(s) }

// IsAllResourcesTarget reports whether a path target stands for every resource,
// of everything ("*") or of one service ("*:s3").
func IsAllResourcesTarget(s string) bool { return isAllResourcesTarget(s) }
