// Package passwordpolicy is the one rule every console password must meet:
// set by an admin for a new user, reset by an admin, or changed by its owner.
package passwordpolicy

import (
	"strconv"
	"strings"
	"unicode"
)

const (
	MinLen = 12
	MaxLen = 72 // bcrypt ignores anything past this
)

// Rule is the policy in words, for the console to show next to the field.
const Rule = "12 to 72 characters with an upper-case letter, a lower-case letter, a number and a symbol, and no spaces at the start or end."

// Check returns why pw does not meet the policy, or "" when it does. A
// password of one kind of character only (all digits, all spaces) is refused.
func Check(pw string) string {
	n := len(pw)
	if n < MinLen || n > MaxLen {
		return "Use a password of " + strconv.Itoa(MinLen) + " to " + strconv.Itoa(MaxLen) + " characters."
	}
	if strings.TrimSpace(pw) != pw {
		return "The password cannot start or end with a space."
	}
	var upper, lower, digit, symbol bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		case unicode.IsSpace(r):
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			symbol = true
		}
	}
	var missing []string
	if !upper {
		missing = append(missing, "an upper-case letter")
	}
	if !lower {
		missing = append(missing, "a lower-case letter")
	}
	if !digit {
		missing = append(missing, "a number")
	}
	if !symbol {
		missing = append(missing, "a symbol")
	}
	if len(missing) > 0 {
		return "Add " + join(missing) + " to the password."
	}
	return ""
}

func join(items []string) string {
	if len(items) == 1 {
		return items[0]
	}
	return strings.Join(items[:len(items)-1], ", ") + " and " + items[len(items)-1]
}
