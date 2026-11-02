package auditlog

import "encoding/json"

// decodeDetails turns the stored jsonb back into a map. A row whose details
// cannot be decoded is still worth showing, so the entry keeps its other
// columns and loses only this field.
func decodeDetails(raw string) map[string]any {
	if raw == "" || raw == "{}" {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
