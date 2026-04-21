import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandColors, BrandFonts } from '@/constants/theme';

export default function ThankYouScreen() {
  const router = useRouter();

  const goHome = () => {
    // Replace so user cannot go back to Capture page
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thank You!</Text>
      <Text style={styles.subtitle}>Your submission was received.</Text>

      <Pressable style={styles.button} onPress={goHome}>
        <Text style={styles.buttonText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: BrandColors.background,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#111',
    fontFamily: BrandFonts.primary,
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: BrandColors.primary,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: BrandFonts.primary,
  },
});