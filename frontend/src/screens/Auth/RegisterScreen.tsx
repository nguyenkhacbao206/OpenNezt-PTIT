/**
 * RegisterScreen — collects the sign-up fields, validates them, and calls the
 * auth store `register` action.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Input } from '@/components/ui';
import { SafeAreaWrapper, Container } from '@/components/layout';
import { useAuth } from '@/components/hooks';
import {
  validateEmail,
  validatePassword,
  validateRequired,
  isFormValid,
} from '@/components/utils';
import type { AuthStackScreenProps } from '@/navigation/types';

type Props = AuthStackScreenProps<'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register, status, error } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName: string | null;
    email: string | null;
    password: string | null;
  }>({ fullName: null, email: null, password: null });

  const submitting = status === 'loading';

  const handleSubmit = async () => {
    const errors = {
      fullName: validateRequired(fullName, 'Full name'),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(errors);
    if (!isFormValid(errors)) return;

    try {
      await register({ fullName, email, password });
    } catch {
      // Error surfaced via the `error` field.
    }
  };

  return (
    <SafeAreaWrapper edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <Container scroll contentContainerClassName="flex-grow justify-center">
          <View className="mb-6">
            <Text className="text-3xl font-bold text-gray-900">Create account</Text>
            <Text className="mt-1 text-muted">Join us in a few seconds</Text>
          </View>

          <View className="gap-4">
            <Input
              label="Full name"
              placeholder="Jane Doe"
              value={fullName}
              onChangeText={setFullName}
              error={fieldErrors.fullName}
            />
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
              placeholder="At least 6 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
            />

            {error ? <Text className="text-sm text-danger">{error}</Text> : null}

            <Button
              label="Create account"
              fullWidth
              loading={submitting}
              onPress={() => void handleSubmit()}
            />

            <View className="mt-2 flex-row justify-center">
              <Text className="text-muted">Already have an account? </Text>
              <Text
                className="font-semibold text-primary"
                onPress={() => navigation.navigate('Login')}
              >
                Sign in
              </Text>
            </View>
          </View>
        </Container>
      </KeyboardAvoidingView>
    </SafeAreaWrapper>
  );
}
