import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, BackHandler, DeviceEventEmitter, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadTapCount, saveTapCount } from '../lib/tappingPattern';
import {
  sendWearableCommand,
  subscribeWearable,
  getWearableSnapshot,
  cancelWearableSetupSession,
  isWearableSetupRecording,
} from '../lib/wearable';

const MIN_TAPS = 3;
// The shared Bluetooth service forwards cumulative tap counts from the bracelet.
const BRACELET_TAP_EVENT = 'halo.bracelet.tap';
const BRACELET_TOO_FEW_EVENT = 'halo.bracelet.too-few';
const BRACELET_PATTERN_SAVED_EVENT = 'halo.bracelet.pattern-saved';
type Phase = 'idle' | 'loading' | 'load-error' | 'recording' | 'too-few' | 'saving' | 'save-error' | 'saved';
type Dialog = 'reset' | 'discard' | null;

export default function TappingPatternScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('loading');
  const [count, setCount] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const savedCount = useRef<number | null>(null);
  const draftCount = useRef(0);
  const phaseRef = useRef<Phase>('loading');
  const dialogRef = useRef<Dialog>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const saving = useRef(false);
  const braceletTapHandler = useRef<(count: number) => void>(() => {});
  const setupArmed = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  function changePhase(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function showDialog(next: Dialog) {
    clearTimer();
    dialogRef.current = next;
    setDialog(next);
  }

  const load = useCallback(async () => {
    setupArmed.current = false;
    cancelWearableSetupSession();
    phaseRef.current = 'loading';
    setPhase('loading');
    setError('');
    try {
      const value = await loadTapCount();
      if (!mounted.current) return;
      savedCount.current = value;
      draftCount.current = 0;
      setCount(value !== null && value >= MIN_TAPS ? value : 0);
      // Legacy counts below three remain in storage until a valid replacement is saved.
      const next: Phase = value === null? 'idle': value < MIN_TAPS? 'idle': 'saved';
      phaseRef.current = next;
      setupArmed.current = false;
      setPhase(next);
    } catch {
      if (!mounted.current) return;
      phaseRef.current = 'load-error';
      setPhase('load-error');
      setError('Could not load your saved pattern. Please try again.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setupArmed.current = false;
        cancelWearableSetupSession();
        clearTimer();
        if (phaseRef.current === 'recording') {
          draftCount.current = 0;
          setCount(0);
          changePhase('idle');
        }
      }
    });
    return () => {
      mounted.current = false;
      setupArmed.current = false;
      cancelWearableSetupSession();
      clearTimer();
      subscription.remove();
    };
  }, [clearTimer, load]);

  // NEW: Stop tapping-pattern setup if Bluetooth disconnects.
useEffect(() => {
  const checkConnection = () => {
    const snapshot = getWearableSnapshot();

    if (
      setupArmed.current &&
      snapshot.phase !== 'connected'
    ) {
      setupArmed.current = false;
      cancelWearableSetupSession();
      clearTimer();
      setError(
        'Wearable disconnected. Reconnect to restart setup.'
      );
      changePhase('idle');
    }
  };

  const unsubscribe = subscribeWearable(checkConnection);

  return () => {
    unsubscribe();
  };
}, [clearTimer]);

  const exit = useCallback(() => {
  setupArmed.current = false;
  cancelWearableSetupSession();
  clearTimer();

  if (router.canGoBack()) router.back();
  else router.replace('/');
}, [clearTimer, router]);

  const requestExit = useCallback(() => {
    if (saving.current) return;
    if (phaseRef.current !== 'saved' && phaseRef.current !== 'load-error' && draftCount.current > 0) {
      clearTimer();
      dialogRef.current = 'discard';
      setDialog('discard');
    } else exit();
  }, [clearTimer, exit]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit();
      return true;
    });
    const braceletSubscription = DeviceEventEmitter.addListener(
      BRACELET_TAP_EVENT,
      (count: number) => {
        braceletTapHandler.current(count);
    }
    );

const tooFewSubscription = DeviceEventEmitter.addListener(
  BRACELET_TOO_FEW_EVENT,
  () => {
    if (!setupArmed.current) return;
    if (phaseRef.current !== 'recording') return;

    setupArmed.current = false;
    cancelWearableSetupSession();
    clearTimer();
    changePhase('too-few');
  }
);

const patternSavedSubscription = DeviceEventEmitter.addListener(
  BRACELET_PATTERN_SAVED_EVENT,
  () => {
    if (!setupArmed.current) return;
    if (phaseRef.current !== 'recording') return;

    // Firmware has confirmed setup completion.
    setupArmed.current = false;
    cancelWearableSetupSession();

    void finishPattern();
  }
);

    return () => {
      setupArmed.current = false;
      cancelWearableSetupSession();
      draftCount.current = 0;
      if (mounted.current && phaseRef.current === 'recording') {
        setCount(0);
        changePhase('idle');
      }
      clearTimer();
      subscription.remove();
      [braceletSubscription, tooFewSubscription, patternSavedSubscription].forEach(
        (uiSubscription) => uiSubscription.remove()
      );
    };
  }, [clearTimer, requestExit]));

const startingSetup = useRef(false);

async function beginBraceletSetup() {
  if (!mounted.current || AppState.currentState !== 'active'
    || startingSetup.current || saving.current || setupArmed.current || dialogRef.current !== null) return;

  startingSetup.current = true;
  setupArmed.current = true;
  setError('');

  clearTimer();
  draftCount.current = 0;
  setCount(0);
  changePhase('recording');

  try {
    await sendWearableCommand('BEGIN SET UP');
  } catch (error) {
    setupArmed.current = false;
    cancelWearableSetupSession();
    if (!mounted.current) return;
    draftCount.current = 0;
    setCount(0);
    changePhase('idle');

    setError(
      'Unable to start recording. Check your wearable connection and try again.'
    );
  } finally {
    startingSetup.current = false;
  }
}


  // Saving starts only after the bracelet reports PATTERN SAVED.
async function finishPattern() {
  clearTimer();

  if (!mounted.current ||
      saving.current ||
      dialogRef.current !== null ||
      phaseRef.current !== 'recording') {
    return;
  }

  const value = draftCount.current;

  if (value < MIN_TAPS) {
    changePhase('too-few');
    return;
  }

  saving.current = true;
  changePhase('saving');
  setError('');

  try {
    // Called only after firmware sends PATTERN SAVED.
    await saveTapCount(value);

    // Request detection mode on the wearable.
    await sendWearableCommand('DETECTION MODE');

    if (!mounted.current) return;

    savedCount.current = value;
    changePhase('saved');
  } catch (error) {
    if (!mounted.current) return;

    setError(
      'Unable to save your pattern. Please try again.'
    );

    changePhase('save-error');
  } finally {
    saving.current = false;
  }
}


  // Ignore counts unless the user explicitly started this screen's setup session.
function receiveBraceletTap(count: number) {
  if (
    !mounted.current ||
    AppState.currentState !== 'active'
  ) {
    return;
  }

  // Never update the setup counter outside an active session.
  if (
    !setupArmed.current ||
    !isWearableSetupRecording() ||
    phaseRef.current !== 'recording' ||
    dialogRef.current !== null
  ) {
    return;
  }

  if (!Number.isSafeInteger(count) || count < 1) {
    return;
  }

  draftCount.current = count;
  setCount(count);
}



  braceletTapHandler.current = receiveBraceletTap;

  // Reset prepares a new pattern; only the Begin button arms recording.
  function resetPattern() {
    setupArmed.current = false;
    cancelWearableSetupSession();
    showDialog(null);
    draftCount.current = 0;
    setCount(0);
    setError('');
    changePhase('idle');
  }

  function closeDialog() {
  showDialog(null);
}

  const busy = phase === 'saving' || phase === 'loading';
  const isSaved = phase === 'saved';
  const title = isSaved ? 'Tapping pattern saved' : phase === 'too-few' ? 'Try your pattern again' : 'Create your pattern';
  const description = isSaved ? 'Your tap count has been saved on this device.'
    : phase === 'idle' || phase === 'too-few' ? 'Press Begin wearable setup when you are ready to record your tapping pattern.'
      : 'Tap your pattern on your bracelet. Pause for 2 seconds when you’re finished.\nUse at least 3 taps.';
  const status = isSaved ? 'Pattern saved ✓' : phase === 'too-few' ? 'Pattern not saved'
    : phase === 'saving' ? 'Saving pattern…' : phase === 'save-error' ? 'Pattern not saved'
    : phase === 'recording' ? (count > 0 ? 'Recording from bracelet' : 'Waiting for bracelet taps')
    : 'Press Begin wearable setup to start';

  return (
    <>
      <Stack.Screen options={{
        title: 'Tapping Pattern', headerTitleAlign: 'center', headerTintColor: '#091C57',
        headerStyle: { backgroundColor: '#FFFFFF' },
        gestureEnabled: !busy && (isSaved || count === 0), headerBackVisible: false,
        headerLeft: () => (
          <Pressable onPress={requestExit} disabled={busy} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Back to setup menu"
            accessibilityState={{ disabled: busy }}>
            <Text style={[styles.back, busy && styles.disabled]}>‹ Back</Text>
          </Pressable>
        ),
      }} />
      <ScrollView style={styles.screen} bounces={false}
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {phase === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color="#091C57" />
            <Text style={styles.description}>Loading your pattern…</Text>
          </View>
        ) : phase === 'load-error' ? (
          <>
            <Text style={styles.heading}>Tapping pattern unavailable</Text>
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
            <View style={styles.actions}>
              <Button label="Try again" onPress={() => { void load(); }} />
              <Button label="Back to setup menu" secondary onPress={exit} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.heading} accessibilityRole="header">{title}</Text>
              <Text style={styles.description}>{description}</Text>
              <View style={styles.noticeSlot}>
                {phase === 'too-few' && (
                  <Text style={styles.warning} accessibilityRole="alert">
                    You must have at least 3 taps in your pattern.
                  </Text>
                )}
              </View>
            </View>
            <View testID="tap-count" accessible accessibilityRole="text"
              accessibilityLabel={`Taps received: ${count}. ${status}`}
              style={styles.countCard}>
              <Text style={styles.cardTitle}>{isSaved ? 'Saved taps' : 'Taps received'}</Text>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
            </View>
            {phase === 'save-error' && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <View style={styles.actions}>
              {phase === 'save-error' && <Button label="Try saving again" onPress={() => { void finishPattern(); }} />}
              <Button
                label="Begin wearable setup"
                onPress={() => void beginBraceletSetup()}
                disabled={busy || phase === 'recording'}
              />
              {!!error && phase !== 'save-error' && (
                <Text style={styles.error}>{error}</Text>
        )}
              <Button label="Reset pattern" secondary disabled={busy} onPress={() => showDialog('reset')} />
              <Button label="Back to setup menu" quiet={!isSaved} disabled={busy} onPress={requestExit} />
            </View>
          </>
        )}
      </ScrollView>
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={closeDialog} statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.dialogTitle} accessibilityRole="header">{dialog === 'discard' ? 'Leave setup?' : 'Set a new pattern?'}</Text>
            <Text style={styles.dialogMessage}>{dialog === 'discard'
              ? `Your new taps have not been saved.${savedCount.current !== null ? ' Your previous count will stay saved.' : ''}`
              : 'Prepare a new tapping pattern, then press Begin wearable setup to record it. Your previous count stays saved until the new pattern is saved.'}</Text>
            <View style={styles.row}>
              <Button label={dialog === 'discard' ? 'Keep editing' : 'Cancel'} secondary onPress={closeDialog} />
              <Button
                label={dialog === 'discard' ? 'Leave setup' : 'Set new pattern'}
                onPress={() => {
                  if (dialog === 'discard') {
                    showDialog(null);
                    exit();
                  } else {
                    void resetPattern();
                  }
            }}
          />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Button({ label, onPress, secondary = false, quiet = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; quiet?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, quiet && styles.quiet,
        disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FB' },
  container: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingTop: 28 },
  intro: { minHeight: 190 },
  heading: { fontSize: 26, fontWeight: '700', color: '#091C57', marginBottom: 12 },
  description: { fontSize: 17, lineHeight: 24, color: '#091C57' },
  noticeSlot: { minHeight: 68, justifyContent: 'center', paddingVertical: 10 },
  warning: { color: '#B00020', backgroundColor: '#FFE0E0', borderRadius: 12,
    fontSize: 16, lineHeight: 22, fontWeight: '700', paddingVertical: 10, paddingHorizontal: 16 },
  back: { fontSize: 17, color: '#091C57', paddingVertical: 8, paddingRight: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  countCard: { minHeight: 170, padding: 16, backgroundColor: '#DEEBFF', borderRadius: 16,
    alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#091C57', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  count: { color: '#091C57', fontSize: 68, lineHeight: 82, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  status: { color: '#091C57', fontSize: 17, textAlign: 'center' },
  actions: { marginTop: 'auto', paddingTop: 40, gap: 12 },
  button: { flexGrow: 1, flexShrink: 1, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12,
    justifyContent: 'center', backgroundColor: '#C9E0FF', borderColor: '#C9E0FF', borderWidth: 1.5, borderRadius: 10 },
  secondary: { backgroundColor: '#FFFFFF', borderColor: '#091C57' },
  quiet: { backgroundColor: '#FFFFFF', borderColor: 'transparent' },
  buttonText: { color: '#091C57', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24 },
  dialogTitle: { color: '#091C57', fontSize: 25, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  dialogMessage: { color: '#091C57', fontSize: 17, lineHeight: 24, textAlign: 'center', marginBottom: 28 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  error: { color: '#B00020', fontSize: 15, lineHeight: 22, marginTop: 16 },
});
