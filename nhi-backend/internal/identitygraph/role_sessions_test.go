package identitygraph

import "testing"

func TestAssumerKind(t *testing.T) {
	for in, want := range map[[2]string]string{
		{"arn:aws:iam::1:user/bob", "IAMUser"}:               "iam_user",
		{"arn:aws:iam::1:user/bob", ""}:                      "iam_user",
		{"arn:aws:sts::1:assumed-role/R/s", "AssumedRole"}:   "role_session",
		{"ec2.amazonaws.com", "AWSService"}:                  "aws_service",
		{"arn:aws:iam::1:root", "Root"}:                      "root",
		{"arn:aws:sts::1:federated-user/x", "FederatedUser"}: "other",
	} {
		if got := assumerKind(in[0], in[1]); got != want {
			t.Errorf("%v: %s, want %s", in, got, want)
		}
	}
	if !IsRoleARN("arn:aws:iam::1:role/aws-service-role/eks.amazonaws.com/AWSServiceRoleForAmazonEKS") || IsRoleARN("arn:aws:iam::1:user/bob") {
		t.Error("IsRoleARN")
	}
}
