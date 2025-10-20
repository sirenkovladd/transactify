package projectroot

import "embed"

//go:embed dist/index-*.js dist/index-*.css dist/index.html
var WebContent embed.FS
