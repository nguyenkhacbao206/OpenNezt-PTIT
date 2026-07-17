/**
 * HomeScreen — reference screen wiring the full data flow:
 *
 *   Service (userService.list)  →  local + global State (useState / useAuth)
 *                                →  UI (Card / Button / FlatList)
 *
 * Demonstrates loading / error / empty / success states, pull-to-refresh, and
 * strictly-typed navigation props.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Container, SafeAreaWrapper } from '@/components/layout';
import { useAuth } from '@/components/hooks';
import { userService } from '@/services';
import { isApiError } from '@/config/axios';
import { colors } from '@/config/theme';
import type { RequestStatus } from '@/types/common';
import type { User } from '@/types/user';
import type { MainTabScreenProps } from '@/navigation/types';

type Props = MainTabScreenProps<'Home'>;

export function HomeScreen({ navigation }: Props) {
  // --- Global state (from the store, via the useAuth hook) ------------------
  const { user, logout } = useAuth();

  // --- Local screen state --------------------------------------------------
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // --- Service call --------------------------------------------------------
  const loadUsers = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const page = await userService.list(1, 20);
      setUsers(page.items);
      setStatus('success');
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load users.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // --- Render helpers ------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: User }) => (
      <Card
        className="mb-3"
        onPress={() => navigation.navigate('Profile', { userId: item.id })}
      >
        <Text className="text-base font-semibold text-gray-900">{item.fullName}</Text>
        <Text className="text-sm text-muted">{item.email}</Text>
      </Card>
    ),
    [navigation],
  );

  return (
    <SafeAreaWrapper edges={['bottom']}>
      <Container>
        {/* Greeting bound to the global auth state */}
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-sm text-muted">Welcome back,</Text>
            <Text className="text-xl font-bold text-gray-900">
              {user?.fullName ?? 'Guest'}
            </Text>
          </View>
          <Button label="Log out" variant="ghost" size="sm" onPress={() => void logout()} />
        </View>

        {/* Error banner */}
        {status === 'error' && error ? (
          <Card className="mb-3 border-danger/30 bg-danger/5">
            <Text className="text-danger">{error}</Text>
            <Button
              label="Retry"
              variant="outline"
              size="sm"
              className="mt-2"
              onPress={() => void loadUsers()}
            />
          </Card>
        ) : null}

        {/* Data list with loading + empty states */}
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={status === 'loading'}
              onRefresh={() => void loadUsers()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            status === 'success' ? (
              <View className="items-center py-12">
                <Text className="text-muted">No users yet.</Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={users.length === 0 ? { flexGrow: 1 } : undefined}
        />
      </Container>
    </SafeAreaWrapper>
  );
}
