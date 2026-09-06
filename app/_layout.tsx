import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MarginsProvider } from '../src/store/MarginsProvider';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MarginsProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Margins' }} />
          <Stack.Screen name="read/[usfm]/[chapter]" options={{ title: '' }} />
          <Stack.Screen name="search" options={{ title: 'Search' }} />
          <Stack.Screen name="layers" options={{ title: 'Commentaries' }} />
          <Stack.Screen name="commentary/[authorId]" options={{ title: 'Commentary' }} />
          <Stack.Screen name="import" options={{ title: 'Import notes', presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </MarginsProvider>
    </SafeAreaProvider>
  );
}
