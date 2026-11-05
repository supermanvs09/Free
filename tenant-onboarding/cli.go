package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"golang.org/x/term"
)

// readSecret reads a line with the typing hidden when stdin is a terminal, or a
// plain line when it is piped in.
func readSecret(prompt string, in *bufio.Reader) ([]byte, error) {
	fd := int(os.Stdin.Fd())
	if term.IsTerminal(fd) {
		fmt.Fprint(os.Stderr, prompt)
		b, err := term.ReadPassword(fd)
		fmt.Fprintln(os.Stderr)
		return b, err
	}
	line, err := in.ReadString('\n')
	if err == io.EOF && line != "" {
		err = nil
	}
	return []byte(strings.TrimRight(line, "\r\n")), err
}

func readLine(prompt string, in *bufio.Reader) string {
	fmt.Fprint(os.Stderr, prompt)
	line, _ := in.ReadString('\n')
	return strings.TrimSpace(line)
}

func interactive() bool { return term.IsTerminal(int(os.Stdin.Fd())) }

// createAdmin makes a super admin, or sets a new password for an existing one, using
// the same database settings as the service (the .env file or the environment). The
// password is typed hidden and only its bcrypt hash is stored.
func createAdmin() {
	if _, _, err := loadEnvFile(); err != nil {
		log.Fatalf("settings file: %v", err)
	}
	dsn := databaseURL()
	if dsn == "" {
		log.Fatal("no database settings found: set DB_HOST (and the other DB_ values) in your .env file, in the folder you run this from")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("the database is not reachable: %v", err)
	}
	auth := NewAuth(db, env("GLOBAL_SCHEMA", "nhi_global"))

	in := bufio.NewReader(os.Stdin)
	user := ""
	if len(os.Args) > 2 {
		user = strings.TrimSpace(os.Args[2])
	}
	if user == "" {
		user = readLine("Username for the new (or existing) super admin: ", in)
	}
	pw, err := readSecret("Password (12-72 characters): ", in)
	if err != nil {
		log.Fatalf("could not read the password: %v", err)
	}
	if interactive() {
		again, err := readSecret("Repeat it: ", in)
		if err != nil {
			log.Fatalf("could not read the password: %v", err)
		}
		if string(again) != string(pw) {
			log.Fatal("The two entries differ. Nothing was changed.")
		}
	}
	created, err := auth.SetAdmin(ctx, user, string(pw))
	if err != nil {
		log.Fatalf("nothing was changed: %v", err)
	}
	if created {
		fmt.Printf("Created super admin %q. Sign in on the page with this username and the password you just typed.\n", user)
	} else {
		fmt.Printf("Changed the password of %q (and signed them out everywhere). Sign in with the new password.\n", user)
	}
}
