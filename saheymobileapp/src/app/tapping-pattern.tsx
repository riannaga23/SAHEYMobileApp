import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadTapCount, saveTapCount } from '../lib/tappingPattern';

type Dialog = 'setup' | 'reset' | 'save' | 'discard' | null;

export default function TappingPatternScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const saving = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const count = await loadTapCount();
      if (mounted.current) setSavedCount(count);
    } catch {
      if (mounted.current) {
        setLoadFailed(true);
        setError('Could not load your saved tap count. Please try again.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const requestExit = useCallback(() => {
    if (saving.current) return;
    if (recording) setDialog('discard');
    else exit();
  }, [exit, recording]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!recording && !saving.current) return false;
      requestExit();
      return true;
    });
    return () => subscription.remove();
  }, [recording, requestExit]));

  function beginRecording() {
    setDraftCount(0);
    setRecording(true);
    setError('');
    setDialog(null);
  }

  async function save() {
    // Lock synchronously so repeated presses cannot start overlapping writes.
    if (saving.current || !Number.isSafeInteger(draftCount) || draftCount < 1) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await saveTapCount(draftCount);
      if (!mounted.current) return;
      setSavedCount(draftCount);
      setRecording(false);
      setDialog(null);
    } catch {
      if (mounted.current) {
        setError('Could not save your tap count. Your taps are still here. Please try again.');
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function closeDialog() {
    if (saving.current) return;
    setDialog(null);
    setError('');
  }

  const countLabel = `${draftCount} ${draftCount === 1 ? 'tap' : 'taps'}`;
  const dialogContent = dialog === 'save'
    ? { title: `Save ${countLabel}?`, message: 'This count will stay saved until you reset it.', cancel: 'Keep editing', confirm: busy ? 'Saving…' : 'Save count' }
    : dialog === 'reset'
      ? { title: 'Set a new pattern?', message: 'Create and save a new tap count to replace your current count.', cancel: 'Cancel', confirm: 'Set new pattern' }
      : dialog === 'discard'
        ? { title: 'Leave setup?', message: savedCount === null ? 'Your new taps have not been saved.' : 'Your new taps have not been saved. Your previous count will stay saved.', cancel: 'Keep editing', confirm: 'Leave setup' }
        : { title: 'Set up a new pattern?', message: 'You will tap to choose your count, then confirm when you are done.', cancel: 'Cancel', confirm: 'Continue' };

  return (
    <>
      <Stack.Screen options={{
        title: 'Tapping Pattern',
        gestureEnabled: !recording && !busy,
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable onPress={requestExit} disabled={busy} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Back to setup menu"
            accessibilityState={{ disabled: busy }}>
            <Text style={[styles.back, busy && styles.disabled]}>‹ Back</Text>
          </Pressable>
        ),
      }} />
      <ScrollView style={styles.screen}
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) }]}
        bounces={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#173B70" />
            <Text style={styles.description}>Loading your tap count…</Text>
          </View>
        ) : loadFailed ? (
          <>
            <Text style={styles.heading}>Tapping pattern unavailable</Text>
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
            <View style={styles.actions}>
              <Button label="Try again" onPress={() => { void load(); }} />
              <Button label="Back to setup menu" onPress={exit} secondary />
            </View>
          </>
        ) : recording ? (
          <>
            <Text style={styles.heading}>Create your pattern</Text>
            <Text style={styles.description}>Tap the area below. Press Done when you are finished.</Text>
            <Pressable
              testID="tap-area" accessibilityRole="button" accessibilityLabel="Tap here"
              accessibilityHint="Each press adds one tap to your count."
              accessibilityValue={{ text: countLabel }}
              disabled={busy || dialog !== null}
              onPress={() => setDraftCount((count) => Math.min(count + 1, Number.MAX_SAFE_INTEGER))}
              style={({ pressed }) => [styles.tapArea, pressed && styles.pressed]}>
              <Text style={styles.tapLabel}>TAP HERE</Text>
              <Text style={styles.tapCount}>{draftCount}</Text>
              <Text style={styles.tapUnit}>{draftCount === 1 ? 'tap' : 'taps'}</Text>
            </Pressable>
            <View style={styles.row}>
              <Button label="Start over" secondary disabled={draftCount === 0 || busy}
                onPress={() => { setDraftCount(0); setError(''); }} />
              <Button label="Done" disabled={draftCount === 0 || busy}
                onPress={() => { setError(''); setDialog('save'); }} />
            </View>
            {draftCount === 0 && <Text style={styles.hint}>Add at least one tap to continue.</Text>}
          </>
        ) : savedCount !== null ? (
          <>
            <Text style={styles.heading}>Tapping pattern saved</Text>
            <Text style={styles.description}>Your tap count is ready.</Text>
            <View style={styles.savedCard}>
              <Text style={styles.savedLabel}>Saved tap count</Text>
              <Text style={styles.savedCount}>{savedCount} {savedCount === 1 ? 'tap' : 'taps'}</Text>
            </View>
            <View style={styles.actions}>
              <Button label="Reset pattern" secondary onPress={() => setDialog('reset')} />
              <Button label="Back to setup menu" onPress={exit} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Set tapping pattern</Text>
            <Text style={styles.description}>Choose how many times you want to tap.</Text>
            <View style={styles.actions}>
              <Button label="Set up pattern" onPress={() => setDialog('setup')} />
              <Button label="Back to setup menu" onPress={exit} secondary />
            </View>
          </>
        )}
      </ScrollView>
      <Modal visible={dialog !== null} transparent animationType="fade"
        onRequestClose={closeDialog} statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.dialogTitle} accessibilityRole="header">{dialogContent.title}</Text>
            <Text style={styles.dialogMessage}>{dialogContent.message}</Text>
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <View style={styles.row}>
              <Button label={dialogContent.cancel} secondary disabled={busy} onPress={closeDialog} />
              <Button label={dialogContent.confirm} disabled={busy} onPress={() => {
                if (dialog === 'save') void save();
                else if (dialog === 'discard') { setDialog(null); exit(); }
                else beginRecording();
              }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Button({ label, onPress, secondary = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary,
        disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, padding: 24, paddingTop: 32 },
  heading: { fontSize: 24, fontWeight: 'bold', color: '#161A23', marginBottom: 12 },
  description: { fontSize: 16, lineHeight: 24, color: '#555555' },
  back: { fontSize: 17, color: '#173B70', paddingVertical: 8, paddingRight: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  actions: { marginTop: 'auto', paddingTop: 40, gap: 12 },
  button: { flexGrow: 1, flexShrink: 1, backgroundColor: '#EAF2FF', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 16, minHeight: 52, justifyContent: 'center', borderWidth: 1, borderColor: '#EAF2FF' },
  secondary: { backgroundColor: '#FFFFFF', borderColor: '#98A2B3' },
  buttonText: { color: '#173B70', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tapArea: { backgroundColor: '#EAF2FF', borderRadius: 16, minHeight: 240,
    marginTop: 32, marginBottom: 28, padding: 24, alignItems: 'center', justifyContent: 'center' },
  tapLabel: { color: '#173B70', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  tapCount: { color: '#173B70', fontSize: 76, fontWeight: '700', textAlign: 'center' },
  tapUnit: { color: '#173B70', fontSize: 22, marginTop: 4 },
  hint: { color: '#555555', fontSize: 14, marginTop: 16 },
  savedCard: { backgroundColor: '#EAF2FF', borderRadius: 16, padding: 24, marginTop: 32,
    alignItems: 'center', gap: 12 },
  savedLabel: { color: '#173B70', fontSize: 17, fontWeight: '600' },
  savedCount: { color: '#173B70', fontSize: 44, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24 },
  dialogTitle: { fontSize: 23, fontWeight: '700', color: '#161A23', textAlign: 'center', marginBottom: 16 },
  dialogMessage: { fontSize: 16, lineHeight: 24, color: '#555555', marginBottom: 24 },
  error: { fontSize: 15, lineHeight: 22, color: '#B00020', marginBottom: 16 },
});
