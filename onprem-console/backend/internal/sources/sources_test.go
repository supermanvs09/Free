package sources

import (
	"reflect"
	"testing"
)

func TestCredentialRefs(t *testing.T) {
	cfg := []byte(`<flow-definition><definition><script>
pipeline { stages { stage('d') { steps {
  withCredentials([usernamePassword(credentialsId: 'deploy-aws', usernameVariable: 'U', passwordVariable: 'P')]) { sh 'x' }
  environment { T = credentials("sonar-token") }
}}}}</script></definition><scm><userRemoteConfigs><hudson.plugins.git.UserRemoteConfig><credentialsId>git-ssh</credentialsId></hudson.plugins.git.UserRemoteConfig></userRemoteConfigs></scm></flow-definition>`)
	got := CredentialRefs(cfg)
	if want := []string{"deploy-aws", "git-ssh", "sonar-token"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestBaseURL(t *testing.T) {
	if u, err := BaseURL(" https://bb.example.com/ "); err != nil || u != "https://bb.example.com" {
		t.Fatal(u, err)
	}
	for _, bad := range []string{"bb.example.com", "ftp://x", "https://u:p@x", "https://x?a=1"} {
		if _, err := BaseURL(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}
