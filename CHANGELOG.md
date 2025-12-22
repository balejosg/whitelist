# Changelog

## [3.7.0](https://github.com/balejosg/whitelist/compare/v3.6.1...v3.7.0) (2025-12-20)


### Features

* add systemd to Docker E2E tests for full service testing ([e66b06f](https://github.com/balejosg/whitelist/commit/e66b06f15d344e96f9ddb39a46a51a2bd9e4dd68))
* run Linux E2E tests in Docker for full DNS control ([0174f5f](https://github.com/balejosg/whitelist/commit/0174f5fd914dd696307f622a3660c31993178eb9))


### Bug Fixes

* improve systemd E2E test result detection and container cleanup ([29ad7a5](https://github.com/balejosg/whitelist/commit/29ad7a57e0281698d779de779e652c3ff0f96aa9))
* make port 53 check a warning in Docker/CI environments ([1126920](https://github.com/balejosg/whitelist/commit/112692040d42cf2e6edc80545d4d2bd9487740c9))
* move resolv.conf setup to runtime in Docker E2E tests ([a607b77](https://github.com/balejosg/whitelist/commit/a607b77d140e3a55a6146edceea128e74618c48e))
* update E2E validation to expect 6 library scripts (includes rollback.sh) ([2d2c371](https://github.com/balejosg/whitelist/commit/2d2c3713b8d6a187975574440434d29d360fc718))
* update init_directories tests to use correct variables ([fcf25b0](https://github.com/balejosg/whitelist/commit/fcf25b02a5f26fd32dac14d6be524f043d1d9ff2))
* use docker --dns flag instead of modifying resolv.conf ([f282633](https://github.com/balejosg/whitelist/commit/f2826338e42f6a0d2ba9c0523595ffca74ab6b98))
