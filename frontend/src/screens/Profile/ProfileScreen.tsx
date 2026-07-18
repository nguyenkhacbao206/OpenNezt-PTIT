/**
 * ProfileScreen — shows the current (or a routed) user's details and offers a
 * confirm-to-logout flow via the CustomModal.
 *
 * `route.params.userId` is optional and fully typed by MainTabParamList.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, CustomModal } from '@/components/ui';
import { SafeAreaWrapper, Container } from '@/components/layout';
import { useAuth } from '@/components/hooks';
import { formatDate } from '@/components/utils';
import type { MainTabScreenProps } from '@/navigation/types';

type Props = MainTabScreenProps<'Profile'>;

export function ProfileScreen({ route }: Props) {
  const { user, logout } = useAuth();
  const [confirmVisible, setConfirmVisible] = useState(false);

  // When navigated with a specific userId you would fetch that profile here;
  // for the base we show the authenticated user.
  const routedUserId = route.params?.userId;

  if (!user) {
    return (
      <SafeAreaWrapper>
        <Container className="items-center justify-center">
          <Text className="text-muted">No profile available.</Text>
        </Container>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper edges={['bottom']}>
      <Container scroll>
        <View className="mb-6 items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <Text className="text-3xl font-bold text-primary">
              {user.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="mt-3 text-xl font-bold text-gray-900">{user.fullName}</Text>
          <Text className="text-muted">{user.email}</Text>
        </View>

        <Card className="mb-3">
          <Row label="Role" value={user.role} />
          <Row label="User ID" value={routedUserId ?? user.id} />
          <Row label="Member since" value={formatDate(user.createdAt)} isLast />
        </Card>

        <Button
          label="Log out"
          variant="danger"
          fullWidth
          onPress={() => setConfirmVisible(true)}
        />
      </Container>

      <CustomModal
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        title="Log out?"
      >
        <Text className="mb-4 text-muted">You will need to sign in again.</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Cancel"
              variant="outline"
              fullWidth
              onPress={() => setConfirmVisible(false)}
            />
          </View>
          <View className="flex-1">
            <Button
              label="Log out"
              variant="danger"
              fullWidth
              onPress={() => {
                setConfirmVisible(false);
                void logout();
              }}
            />
          </View>
        </View>
      </CustomModal>
    </SafeAreaWrapper>
  );
}

function Row({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row justify-between py-3 ${
        isLast ? '' : 'border-b border-gray-100'
      }`}
    >
      <Text className="text-muted">{label}</Text>
      <Text className="font-medium text-gray-900">{value}</Text>
    </View>
  );
}
