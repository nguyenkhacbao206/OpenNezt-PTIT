/**
 * RttStack — luồng demo RTT 8 bước (rtt_hackathon.pen).
 * Các màn đã cắt dùng component thật; màn chưa cắt dùng placeholder tạm.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Demo1Language } from '@/screens/rtt/Demo1Language';
import { Demo2Devices } from '@/screens/rtt/Demo2Devices';
import { Demo3Invite } from '@/screens/rtt/Demo3Invite';
import { Demo4Meeting } from '@/screens/rtt/Demo4Meeting';
import { Demo5ListenerView } from '@/screens/rtt/Demo5ListenerView';
import { Demo6YourTurn } from '@/screens/rtt/Demo6YourTurn';
import { Demo7History } from '@/screens/rtt/Demo7History';
import { Demo8EndSession } from '@/screens/rtt/Demo8EndSession';
import type { RttStackParamList } from './rttTypes';

const Stack = createNativeStackNavigator<RttStackParamList>();

export function RttStack() {
  return (
    <Stack.Navigator initialRouteName="Language" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Language" component={Demo1Language} />
      <Stack.Screen name="Devices" component={Demo2Devices} />
      <Stack.Screen name="Invite" component={Demo3Invite} />
      <Stack.Screen name="Meeting" component={Demo4Meeting} />
      <Stack.Screen name="ListenerView" component={Demo5ListenerView} />
      <Stack.Screen name="YourTurn" component={Demo6YourTurn} />
      <Stack.Screen name="History" component={Demo7History} />
      <Stack.Screen name="EndSession" component={Demo8EndSession} />
    </Stack.Navigator>
  );
}
