# Changelog

## [0.8.3](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.8.2...v0.8.3) (2026-04-20)

### Bug Fixes

* **wallet:** route Apple/Google Pay tokenize to tokenizer service ([#62](https://github.com/BoltApp/bolt-react-native-sdk/issues/62)) ([bf2d22c](https://github.com/BoltApp/bolt-react-native-sdk/commit/bf2d22c331c528794b3b95b764f80f361d3085e0))

## [0.8.2](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.8.1...v0.8.2) (2026-04-17)

### Bug Fixes

* replace NativeComponentRegistry.get with codegenNativeComponent for credit card field ([#61](https://github.com/BoltApp/bolt-react-native-sdk/issues/61)) ([bf9dadd](https://github.com/BoltApp/bolt-react-native-sdk/commit/bf9daddf17c5591608ba9bec03dbb34209bd8b5c))

## [0.8.1](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.8.0...v0.8.1) (2026-04-15)

### Bug Fixes

* **credit-card:** replay last validation state to late on() subscribers ([#52](https://github.com/BoltApp/bolt-react-native-sdk/issues/52)) ([9713d94](https://github.com/BoltApp/bolt-react-native-sdk/commit/9713d9427de41ee5da59d5357ab62ae2f3d7df9e))

## [0.8.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.7.4...v0.8.0) (2026-04-15)

### Features

* add native PCI-compliant credit card input (iOS + Android) ([#51](https://github.com/BoltApp/bolt-react-native-sdk/issues/51)) ([ae9c590](https://github.com/BoltApp/bolt-react-native-sdk/commit/ae9c590255f559c6b7e2ba16aee90804a3957d8d))

## [0.7.4](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.7.3...v0.7.4) (2026-04-07)

## [0.7.3](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.7.2...v0.7.3) (2026-04-07)

### Bug Fixes

* **android:** fix Google Pay crash — Activity context and ActivityEventListener ([#49](https://github.com/BoltApp/bolt-react-native-sdk/issues/49)) ([d168760](https://github.com/BoltApp/bolt-react-native-sdk/commit/d16876069c0f448bae2a6d262a381d5c211d3590))

## [0.7.2](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.7.1...v0.7.2) (2026-04-02)

### Miscellaneous

* move example publishable keys to .env, add wallet status banner ([#47](https://github.com/BoltApp/bolt-react-native-sdk/issues/47)) ([17c0b74](https://github.com/BoltApp/bolt-react-native-sdk/commit/17c0b74e9d4a0d35f2f807d8e7f2270632335254))

## [0.7.1](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.7.0...v0.7.1) (2026-04-02)

### Miscellaneous

* untrack .xcode.env.local and add to .gitignore ([#44](https://github.com/BoltApp/bolt-react-native-sdk/issues/44)) ([a02482d](https://github.com/BoltApp/bolt-react-native-sdk/commit/a02482d8502785db0c24cb3e2f8c19bcbf1820ea))

## [0.7.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.6.1...v0.7.0) (2026-04-01)

### Features

* fetch Google Pay config from Bolt API, add button theme support ([#46](https://github.com/BoltApp/bolt-react-native-sdk/issues/46)) ([30d29fb](https://github.com/BoltApp/bolt-react-native-sdk/commit/30d29fb1f10534808b9773c78c1e05911a5fab11))

## [0.6.1](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.6.0...v0.6.1) (2026-03-30)

### Bug Fixes

* split Google Pay merchantId, add borderRadius, fix WebView sizing ([#43](https://github.com/BoltApp/bolt-react-native-sdk/issues/43)) ([8b78fee](https://github.com/BoltApp/bolt-react-native-sdk/commit/8b78feef09651f0e656f3761e6715effb908d8d6))

## [0.6.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.7...v0.6.0) (2026-03-30)

### Features

* add WebView mode for Apple Pay ([#42](https://github.com/BoltApp/bolt-react-native-sdk/issues/42)) ([4417d72](https://github.com/BoltApp/bolt-react-native-sdk/commit/4417d722b4f52b817792caeafb0937935da77a3b))

## [0.5.7](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.6...v0.5.7) (2026-03-26)

### Bug Fixes

- rename ApplePayButtonComponentView to BoltApplePayButtonComponentView ([#40](https://github.com/BoltApp/bolt-react-native-sdk/issues/40)) ([0954f65](https://github.com/BoltApp/bolt-react-native-sdk/commit/0954f65ae731c06c2709aeedbeb3e90518c171f2))

## [0.5.6](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.5...v0.5.6) (2026-03-26)

### Bug Fixes

- register native modules and Fabric components for Expo/New Architecture compatibility ([#39](https://github.com/BoltApp/bolt-react-native-sdk/issues/39)) ([56e7630](https://github.com/BoltApp/bolt-react-native-sdk/commit/56e7630147aeb76b58fc0856060673dcfba5a6a0))

## [0.5.5](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.4...v0.5.5) (2026-03-25)

### Bug Fixes

- resolve codegenNativeComponent parse failure in Expo/Metro bundling ([#38](https://github.com/BoltApp/bolt-react-native-sdk/issues/38)) ([14560e9](https://github.com/BoltApp/bolt-react-native-sdk/commit/14560e9058c9e3f5e012c6badabcc5da88711430))

## [0.5.4](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.3...v0.5.4) (2026-03-25)

### Bug Fixes

- guard codegenNativeComponent behind Platform.OS in native button specs ([#37](https://github.com/BoltApp/bolt-react-native-sdk/issues/37)) ([09b8744](https://github.com/BoltApp/bolt-react-native-sdk/commit/09b8744d3ff5b5311288d758833a55c327c12541)), closes [#36](https://github.com/BoltApp/bolt-react-native-sdk/issues/36)

## [0.5.3](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.2...v0.5.3) (2026-03-25)

### Bug Fixes

- use platform-specific stubs for Apple Pay and Google Pay native components ([#36](https://github.com/BoltApp/bolt-react-native-sdk/issues/36)) ([edd0bd0](https://github.com/BoltApp/bolt-react-native-sdk/commit/edd0bd0d7bd608184001f318d65e88ac87c17ce1))

## [0.5.2](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.1...v0.5.2) (2026-03-24)

### Miscellaneous

- sync sdk version into release commit via release-it hook ([#35](https://github.com/BoltApp/bolt-react-native-sdk/issues/35)) ([d2abe50](https://github.com/BoltApp/bolt-react-native-sdk/commit/d2abe50d931ea3a53e4c9b44ae69d21591e2d392))

## [0.5.1](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.5.0...v0.5.1) (2026-03-24)

### Bug Fixes

- resolve package.json require path error in published lib ([#34](https://github.com/BoltApp/bolt-react-native-sdk/issues/34)) ([f05f5d8](https://github.com/BoltApp/bolt-react-native-sdk/commit/f05f5d89f1b2be5b66fca84a86184d891e988ad3))

## [0.5.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.4.0...v0.5.0) (2026-03-23)

### Features

- replace wallet buttons with native Fabric components for brand compliance and localization ([#33](https://github.com/BoltApp/bolt-react-native-sdk/issues/33)) ([86a1802](https://github.com/BoltApp/bolt-react-native-sdk/commit/86a18024a262fa93d7c3dcfa1170a6b7b80bae8e))

## [0.4.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.3.0...v0.4.0) (2026-03-23)

### Features

- add OTel telemetry pipeline with structured logging and span instrumentation ([#31](https://github.com/BoltApp/bolt-react-native-sdk/issues/31)) ([8643eb7](https://github.com/BoltApp/bolt-react-native-sdk/commit/8643eb731f2099192d91538dd85c2b4c7e59666e))

## [0.3.0](https://github.com/BoltApp/bolt-react-native-sdk/compare/v0.2.0...v0.3.0) (2026-03-19)

### Features

- expose showBillingZIPField config for PCI-sandboxed postal code input ([#30](https://github.com/BoltApp/bolt-react-native-sdk/issues/30)) ([bd39680](https://github.com/BoltApp/bolt-react-native-sdk/commit/bd39680d2b99fbc3909495a0bd2303011e81e8ac))
