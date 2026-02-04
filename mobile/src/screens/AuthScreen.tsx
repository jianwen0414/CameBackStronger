import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Alert,
  Dimensions,
  Easing,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { Shield, ArrowRight, User, Mail, Phone, Lock } from 'lucide-react-native';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

interface AuthScreenProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'login' | 'register';

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Animations
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Breathing animation for logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    ).start();

    // Fade in entrance
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      triggerShake();
      Alert.alert('Required Fields', 'Please enter your email and password');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      triggerShake();
      
      // Better error messages for common issues
      if (error.message.includes('Email not confirmed')) {
        Alert.alert(
          'Email Not Confirmed',
          'Please check your inbox and click the confirmation link we sent you.',
          [
            {
              text: 'Resend Email',
              onPress: async () => {
                const { error: resendError } = await supabase.auth.resend({
                  type: 'signup',
                  email: email,
                });
                if (resendError) {
                  Alert.alert('Error', 'Failed to resend confirmation email');
                } else {
                  Alert.alert('Success', 'Confirmation email sent!');
                }
              },
            },
            {
              text: 'OK',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert('Login Failed', error.message);
      }
    } else {
      try {
        Vibration.vibrate(50);
      } catch (e) {
        console.warn('Vibration not available');
      }
      onLoginSuccess();
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !fullName) {
      triggerShake();
      Alert.alert('Required Fields', 'Please fill in all required fields');
      return;
    }

    if (password.length < 6) {
      triggerShake();
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phoneNumber,
        },
      },
    });
    setLoading(false);

    if (error) {
      triggerShake();
      console.error('Registration error:', error);
      Alert.alert('Registration Failed', error.message || 'An error occurred during registration');
    } else if (data?.user) {
      try {
        Vibration.vibrate(50);
      } catch (e) {
        console.warn('Vibration not available');
      }
      
      // Check if email confirmation is required
      const needsConfirmation = data.user.email_confirmed_at === null;
      
      if (needsConfirmation) {
        Alert.alert(
          'Verify Your Email',
          `We've sent a confirmation link to ${email}. Please check your inbox and click the link to activate your account.`,
          [
            {
              text: 'OK',
              onPress: () => setMode('login'),
            },
          ]
        );
      } else {
        Alert.alert(
          'Welcome to NightWalk',
          'Your account has been created successfully. You can now sign in.',
          [
            {
              text: 'OK',
              onPress: () => setMode('login'),
            },
          ]
        );
      }
    }
  };

  const triggerShake = () => {
    Vibration.vibrate([0, 50, 50, 50]);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#020204" />
      
      {/* Background Grid Effect */}
      <View style={styles.gridBackground} />

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View 
          style={[
            styles.content, 
            { 
              opacity: fadeAnim,
              transform: [{ translateX: shakeAnim }] 
            }
          ]}
        >
          {/* Header / Logo */}
          <View style={styles.header}>
            <Animated.View style={[styles.logoContainer, { transform: [{ scale: breatheAnim }] }]}>
              <Shield size={64} color="#00F0FF" />
              <View style={styles.logoGlow} />
            </Animated.View>
            <Text style={styles.title}>NIGHTWALK</Text>
            <Text style={styles.subtitle}>
              {mode === 'login' ? 'CITIZEN ACCESS' : 'CITIZEN REGISTRATION'}
            </Text>
          </View>

          {/* Inputs */}
          <View style={styles.form}>
            {mode === 'register' && (
              <View style={[styles.inputContainer, focusedInput === 'fullName' && styles.inputFocused]}>
                <User size={16} color="#666" style={styles.inputIcon} />
                <Text style={[styles.label, (focusedInput === 'fullName' || fullName) && styles.labelFloating]}>
                  FULL NAME
                </Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocusedInput('fullName')}
                  onBlur={() => setFocusedInput(null)}
                  autoCapitalize="words"
                  placeholderTextColor="transparent"
                />
                {focusedInput === 'fullName' && <View style={styles.inputGlow} />}
              </View>
            )}

            <View style={[styles.inputContainer, focusedInput === 'email' && styles.inputFocused]}>
              <Mail size={16} color="#666" style={styles.inputIcon} />
              <Text style={[styles.label, (focusedInput === 'email' || email) && styles.labelFloating]}>
                EMAIL ADDRESS
              </Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('email')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="transparent"
              />
              {focusedInput === 'email' && <View style={styles.inputGlow} />}
            </View>

            {mode === 'register' && (
              <View style={[styles.inputContainer, focusedInput === 'phone' && styles.inputFocused]}>
                <Phone size={16} color="#666" style={styles.inputIcon} />
                <Text style={[styles.label, (focusedInput === 'phone' || phoneNumber) && styles.labelFloating]}>
                  PHONE NUMBER (OPTIONAL)
                </Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  onFocus={() => setFocusedInput('phone')}
                  onBlur={() => setFocusedInput(null)}
                  keyboardType="phone-pad"
                  placeholderTextColor="transparent"
                />
                {focusedInput === 'phone' && <View style={styles.inputGlow} />}
              </View>
            )}

            <View style={[styles.inputContainer, focusedInput === 'password' && styles.inputFocused]}>
              <Lock size={16} color="#666" style={styles.inputIcon} />
              <Text style={[styles.label, (focusedInput === 'password' || password) && styles.labelFloating]}>
                PASSWORD
              </Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry
                placeholderTextColor="transparent"
              />
              {focusedInput === 'password' && <View style={styles.inputGlow} />}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={mode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={styles.loginBtnContent}>
                <Text style={styles.loginBtnText}>
                  {loading 
                    ? (mode === 'login' ? 'SIGNING IN...' : 'CREATING ACCOUNT...') 
                    : (mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT')
                  }
                </Text>
                {!loading && <ArrowRight size={20} color="#020204" />}
              </View>
              <View style={styles.btnReactorGlow} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.switchModeBtn} 
              onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              <Text style={styles.switchModeText}>
                {mode === 'login' 
                  ? "Don't have an account? Register" 
                  : 'Already have an account? Sign In'
                }
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>NIGHTWALK CITIZEN NETWORK v2.0.77</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020204',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  gridBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.1,
    borderWidth: 1,
    borderColor: '#333',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00F0FF',
    opacity: 0.3,
    zIndex: -1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 240, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    color: '#00F0FF',
    fontSize: 10,
    letterSpacing: 3,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  form: {
    gap: 24,
    marginBottom: 30,
  },
  inputContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingVertical: 8,
    position: 'relative',
    paddingLeft: 28,
  },
  inputIcon: {
    position: 'absolute',
    left: 0,
    top: 18,
  },
  inputFocused: {
    borderBottomColor: '#00F0FF',
  },
  inputGlow: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#00F0FF',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  label: {
    position: 'absolute',
    left: 28,
    top: 18,
    color: '#666',
    fontSize: 12,
    letterSpacing: 1,
  },
  labelFloating: {
    top: -10,
    fontSize: 9,
    color: '#00F0FF',
  },
  input: {
    color: '#FFF',
    fontSize: 15,
    paddingVertical: 8,
    letterSpacing: 0.5,
  },
  actions: {
    gap: 20,
    alignItems: 'center',
  },
  loginBtn: {
    width: '100%',
    height: 56,
    backgroundColor: '#00F0FF',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  loginBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1,
  },
  loginBtnText: {
    color: '#020204',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 2,
  },
  btnReactorGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00F0FF',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  switchModeBtn: {
    paddingVertical: 12,
  },
  switchModeText: {
    color: '#666',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: '#333',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});
