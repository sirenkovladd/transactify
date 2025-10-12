package main

import (
	"fmt"
	"log"

	"code.sirenko.ca/transaction/src"
)

func main() {
	// Establish the parameters to use for Argon2.
	p := &src.Params{
		Memory:      64 * 1024,
		Iterations:  3,
		Parallelism: 2,
		SaltLength:  16,
		KeyLength:   32,
	}

	// Pass the plaintext password and parameters to our generateFromPassword
	// helper function.
	hash, err := src.GenerateFromPassword("password", p)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(hash)
}
