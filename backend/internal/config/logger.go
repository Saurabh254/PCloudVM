package config

import (
	"go.uber.org/zap"
)

var Logger *zap.Logger

func InitLogger(env string) {
	var err error
	if env == "dev" {
		Logger, err = zap.NewDevelopment()
	} else {
		Logger, err = zap.NewProduction()
	}
	if err != nil {
		panic(err) // fail fast
	}
}
