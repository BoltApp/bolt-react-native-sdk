require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "BoltReactNativeSdk"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/BoltApp/bolt-react-native-sdk.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp,c}"
  s.public_header_files = "ios/tweetnacl.h", "ios/tweetnacl-bridge.h"
  s.private_header_files = "ios/BoltReactNativeSdk.h"
  s.resource_bundles = { "BoltCardBrandAssets" => ["ios/CardBrandAssets/*.png"] }

  install_modules_dependencies(s)
end
