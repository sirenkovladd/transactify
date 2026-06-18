package migrationsbbolt

import "testing"

func TestRegistryIsOrdered(t *testing.T) {
	for i := 1; i < len(All); i++ {
		if All[i-1].Version >= All[i].Version {
			t.Errorf("migrations out of order: %q >= %q", All[i-1].Version, All[i].Version)
		}
	}
}
