import { Text, View, StyleSheet } from 'react-native';
import { divide, multiply } from 'bolt-react-native-sdk';

const multiplyResult = multiply(3, 7);
const divideResult = divide(10, 2);

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Multiply Result: {multiplyResult}</Text>
      <Text>Divide Result: {divideResult}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
