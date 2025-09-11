package config

func Load() *Config {
	return &Config{
		AppName: "PCloudVM Backend",
		Port:    8080,
	}
}
