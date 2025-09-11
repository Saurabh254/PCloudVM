package qemu

import (
	"crypto/rand"
	"fmt"
	"log"
)

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func GenerateInstanceID(instanceType string) string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		log.Fatalf("failed to generate instance ID: %v", err)
	}

	for i := 0; i < 32; i++ {
		b[i] = charset[int(b[i])%len(charset)]
	}

	return fmt.Sprint("instance-" + instanceType + "-" + string(b))
}
