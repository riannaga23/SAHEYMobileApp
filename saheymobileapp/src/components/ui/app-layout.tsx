import { Pressable, StyleSheet, Text } from 'react-native';

export function AppButton({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [ui.button, secondary && ui.secondaryButton, disabled && ui.disabled, pressed && ui.pressed]}>
    <Text style={[ui.buttonText, secondary && ui.secondaryButtonText]}>{title}</Text>
  </Pressable>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FB' },
  content: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingBottom: 40, gap: 20 },
  heading: { color: '#172B4D', fontSize: 28, lineHeight: 34, fontWeight: '700' },
  body: { color: '#57657B', fontSize: 15, lineHeight: 23 },
  title: { color: '#172B4D', fontSize: 18, fontWeight: '600', lineHeight: 25 },
  card: { padding: 20, gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  button: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: '#173B70', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderColor: '#CCD7E6', borderWidth: 1 },
  secondaryButtonText: { color: '#173B70' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#CCD7E6', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#172B4D' },
  label: { fontSize: 14, fontWeight: '600', color: '#344563' },
  link: { color: '#173B70', fontSize: 15, fontWeight: '600' },
  error: { color: '#A4262C', fontSize: 15, lineHeight: 22 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
