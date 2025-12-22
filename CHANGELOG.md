# Changelog

## [4.0.0](https://github.com/balejosg/openpath/compare/v3.7.0...v4.0.0) (2025-12-22)


### ⚠ BREAKING CHANGES

* rebrand configuration keys and extension ID to OpenPath

### Features

* add E2E tests for teacher role workflow ([4f46923](https://github.com/balejosg/openpath/commit/4f4692328421afb1805c31b964984ce128e27dd4))
* add separate auth test suite (npm run test:auth) ([0032cef](https://github.com/balejosg/openpath/commit/0032ceff2c646d2a85f99b79f59411e7eb236768))
* add test:all runner for sequential test execution ([e63aa05](https://github.com/balejosg/openpath/commit/e63aa05c7c7e7300baf98eb1fcad11a85281aa50))
* implement teacher role authentication and user management ([5b39562](https://github.com/balejosg/openpath/commit/5b395620f645c08ba7b426e8ada2a5aef00c933a))
* rebrand configuration keys and extension ID to OpenPath ([8f9e443](https://github.com/balejosg/openpath/commit/8f9e443604e1cf2a16d24daa0924ce2fe9db094e))
* teacher dashboard filtering - show only assigned groups ([641f32e](https://github.com/balejosg/openpath/commit/641f32ec7f1fadc81c1bd4c6f44a67423732d8c5))
* **US2:** Dashboard Profesor - Teacher dashboard UX improvements ([9211fe8](https://github.com/balejosg/openpath/commit/9211fe86a18a28168288634cfb18b105899ef3d8))


### Bug Fixes

* all markdown lint errors in APP_DESCRIPTION.md ([26a61ec](https://github.com/balejosg/openpath/commit/26a61ecc7dd29ad6a846d434ceebca160b09bac5))
* **build:** update build-deb.sh and native host to use OpenPath branding ([404071b](https://github.com/balejosg/openpath/commit/404071b8160b3aa322c6c96624588a514405ddd3))
* **ci:** correct prerelease deb job dependency chain ([8761bad](https://github.com/balejosg/openpath/commit/8761bad5683b80063def8e66101df6658121d4da))
* **ci:** Reduce dashboard coverage threshold to 0% ([e66ad2e](https://github.com/balejosg/openpath/commit/e66ad2efc6a3f62758a488bf508841b1d796d010))
* **ci:** remove invalid description from workflow_call inputs ([c496bb0](https://github.com/balejosg/openpath/commit/c496bb0edc57a78c9640f4ad6b0e0f30c2bfc9f6))
* **ci:** simplify prerelease version format ([a3ee58a](https://github.com/balejosg/openpath/commit/a3ee58a8e4e92b354de5a1a6174805c81b7251ba))
* correct path for apt-setup.sh in build workflows ([895821f](https://github.com/balejosg/openpath/commit/895821ff434190aab0757c567bf4bb47aeeb83c7))
* **deploy:** Add connectivity pre-check with DNS retry before deployment ([751e4d9](https://github.com/balejosg/openpath/commit/751e4d9af53e242ef9de923c11d3fabf5006f468))
* **deploy:** Add continue-on-error and increased timeouts for network issues ([944a21d](https://github.com/balejosg/openpath/commit/944a21d0885706b4aa41435a62a247dcb56ab3ea))
* **deploy:** Fix workflow syntax errors - remove invalid secrets check ([7725e8f](https://github.com/balejosg/openpath/commit/7725e8ff087b5ca29bd2c6a4e476141d88b9c09c))
* **deploy:** Pre-resolve DNS to IP before SSH action ([5662567](https://github.com/balejosg/openpath/commit/566256758954ee6690572b7c2c61d75ab8455428))
* **e2e:** fix linux E2E failures by updating DNSMASQ_CONF and script permissions ([b7a41f7](https://github.com/balejosg/openpath/commit/b7a41f7a584d2aaa6e65ea23c84c779ab40bd688))
* improve deploy script with permission fixes and modern npm flags ([c6a2aa1](https://github.com/balejosg/openpath/commit/c6a2aa1aa5e482ec01c816a0f70ded7d05c1d309))
* **install:** ensure openpath.conf is created and add missing tmpfiles function ([d9bac83](https://github.com/balejosg/openpath/commit/d9bac8343e430fac09a0fd4fc60436842c8a67fc))
* **lint:** Fix markdown lint errors in LICENSING.md ([909a1c5](https://github.com/balejosg/openpath/commit/909a1c588fe8cd51e0e72400dc2bb472b1b771a9))
* make deploy more robust with git reset --hard ([9bd9275](https://github.com/balejosg/openpath/commit/9bd9275f6e00c80351f25ba140dfa99620f3294f))
* markdown lint errors in README and APP_DESCRIPTION ([f0de1c5](https://github.com/balejosg/openpath/commit/f0de1c562827923f57fe742e3530b672d1b8b458))
* **test:** update bats tests to use OpenPath naming conventions ([059f466](https://github.com/balejosg/openpath/commit/059f4668e2da1d74f0a946d511d776db1d4b1722))
* **test:** update browser.bats to verify openpath.json policy file ([34628a1](https://github.com/balejosg/openpath/commit/34628a1613ee88a8f908a1e6b5d626254672fe6b))
* **test:** update E2E tests to use OpenPath naming conventions ([0b7b316](https://github.com/balejosg/openpath/commit/0b7b31682b09e79047236cd0eb8390249c37cb73))
* update all path references for new directory structure ([fa6a5e3](https://github.com/balejosg/openpath/commit/fa6a5e336338225d6c9ec5b60702d09ddac174b3))
* update build-deb.sh paths for linux/ directory structure ([288b57e](https://github.com/balejosg/openpath/commit/288b57e9bf8b4fd5f626c24c8d13610fc20d6648))
* update docker-e2e-runner.sh paths for linux/ directory structure ([00b636f](https://github.com/balejosg/openpath/commit/00b636fd995ae460cf6af5d2119e9447159549a4))
* update release workflow and validation for OpenPath ([cdede01](https://github.com/balejosg/openpath/commit/cdede01bbd38eaaa8fd2e0e5075f3b7e38ab3044))
* update release-scripts.yml for linux/ directory structure ([65bb690](https://github.com/balejosg/openpath/commit/65bb690587d9229c5106f1be878e660b3765f9aa))
* update remaining file references for OpenPath rebranding ([1edfa4b](https://github.com/balejosg/openpath/commit/1edfa4b856e5725ef1c2a438ddad0044cc0373e6))
* update script paths in build-deb workflows ([10fe89b](https://github.com/balejosg/openpath/commit/10fe89bf0a9e63e004f646becdfb504443b18b92))
* update security workflow paths to match new directory structure ([2c059b7](https://github.com/balejosg/openpath/commit/2c059b7b6573a76200f165aadaee0f1bf4488608))

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
