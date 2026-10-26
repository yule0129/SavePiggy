import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LedgerProvider } from '../LedgerProvider';

export default function Layout() {
  return <SafeAreaProvider style={{ backgroundColor: '#EAE8F1' }}><LedgerProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#EAE8F1' } }} /></LedgerProvider></SafeAreaProvider>;
}
