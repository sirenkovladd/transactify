package projectroot

import "embed"

var production = "false"
var Production = production == "true"

//go:embed dist
var WebContent embed.FS
