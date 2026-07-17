/**
 * LoginScreen — validates input, calls the auth store `login` action, and lets
 * the root navigator swap to the Main flow automatically on success.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';
import { SafeAreaWrapper, Container } from '@/components/layout';
import { useAuth } from '@/components/hooks';
import { validateEmail, validatePassword, isFormValid } from '@/components/utils';
import type { AuthStackScreenProps } from '@/navigation/types';

type Props = AuthStackScreenProps<'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login, status, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email: string | null;
    password: string | null;
  }>({ email: null, password: null });

  const submitting = status === 'loading';

  const handleSubmit = async () => {
    const errors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(errors);
    if (!isFormValid(errors)) return;

    try {
      await login({ email, password });
      // No manual navigation: AppNavigator reacts to the auth state change.
    } catch {
      // Slice already stored the message in `error`; nothing else to do.
    }
  };

  return (
    <SafeAreaWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <Container className="justify-center">
          <View className="mb-8">
            <Text className="text-3xl font-bold text-gray-900">Welcome back</Text>
            <Text className="mt-1 text-muted">Sign in to continue</Text>
          </View>

          <View className="gap-4">
            <Input
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
            />
            <Input
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
            />

            {error ? <Text className="text-sm text-danger">{error}</Text> : null}

            <Button
              label="Sign in"
              fullWidth
              loading={submitting}
              onPress={() => void handleSubmit()}
            />

            <View className="mt-2 flex-row justify-center">
              <Text className="text-muted">Don&apos;t have an account? </Text>
              <Text
                className="font-semibold text-primary"
                onPress={() => navigation.navigate('Register')}
              >
                Register
              </Text>
            </View>
          </View>
        </Container>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}
