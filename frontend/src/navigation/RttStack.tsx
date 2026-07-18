/**
 * RttStack — luồng demo RTT 8 bước (rtt_hackathon.pen).
 * Các màn đã cắt dùng component thật; màn chưa cắt dùng placeholder tạm.
 *
 * Mọi màn được bọc `withRttCanvas`: trên desktop giữ nguyên, trên điện thoại
 * (màn hẹp) tự thu nhỏ layout desktop cho vừa khít để test.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { withRttCanvas } from '@/components/layout';
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

// Các màn đã responsive thật cho mobile → dùng trực tiếp, KHÔNG scale canvas.
// Chỉ Demo5 (màn tĩnh, ngoài luồng ghép phòng) còn giữ canvas thu-nhỏ desktop.
const LanguageScreen = Demo1Language;
const DevicesScreen = Demo2Devices;
const InviteScreen = Demo3Invite;
const MeetingScreen = Demo4Meeting;
const ListenerViewScreen = withRttCanvas(Demo5ListenerView);
const YourTurnScreen = Demo6YourTurn;
const HistoryScreen = Demo7History;
const EndSessionScreen = Demo8EndSession;

export function RttStack() {
  return (
    <Stack.Navigator initialRouteName="Language" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Language" component={LanguageScreen} />
      <Stack.Screen name="Devices" component={DevicesScreen} />
      <Stack.Screen name="Invite" component={InviteScreen} />
      <Stack.Screen name="Meeting" component={MeetingScreen} />
      <Stack.Screen name="ListenerView" component={ListenerViewScreen} />
      <Stack.Screen name="YourTurn" component={YourTurnScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="EndSession" component={EndSessionScreen} />
    </Stack.Navigator>
  );
}
