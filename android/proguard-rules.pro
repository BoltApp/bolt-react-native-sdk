# SR-14: ProGuard/R8 rules for credit card data handling classes.
#
# These rules ensure critical crypto and zeroing methods are not
# optimized away or inlined by R8. Class names are NOT kept (allowing
# obfuscation) — only the specific methods needed for correctness.

# Keep NaCl crypto methods from being removed or inlined
-keepclassmembers class com.boltreactnativesdk.creditcardfield.TweetNaCl {
    public static int crypto_box_keypair(byte[], byte[]);
    public static int crypto_box(byte[], byte[], long, byte[], byte[], byte[]);
    public static int crypto_box_open(byte[], byte[], long, byte[], byte[], byte[]);
    public static void randombytes(byte[]);
}

# Ensure buffer zeroing calls are not optimized away
-keepclassmembers class com.boltreactnativesdk.creditcardfield.BoltCardFieldView {
    public void zeroAllBuffers();
}

# Keep React Native ViewManager and Module names for bridge registration
-keepnames class com.boltreactnativesdk.creditcardfield.BoltCardFieldManager
-keepnames class com.boltreactnativesdk.creditcardfield.BoltCardFieldModule
