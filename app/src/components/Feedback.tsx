import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface Feedback {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  toast: (message: string) => void;
}

const Ctx = createContext<Feedback | null>(null);

/** App-wide replacement for the OS Alert: a smooth custom confirm dialog + toast. */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { id: number }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setConfirmState({ ...opts, id: Date.now() });
    });
  }, []);

  const settle = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      <ConfirmDialog state={confirmState} onResolve={settle} />
      <Toast message={toastMsg} />
    </Ctx.Provider>
  );
}

function ConfirmDialog({ state, onResolve }: { state: (ConfirmOpts & { id: number }) | null; onResolve: (v: boolean) => void }) {
  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [state, mounted, anim]);

  if (!mounted) return null;
  const opts = state; // may be null during exit animation
  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={() => onResolve(false)}>
      <Animated.View style={[styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onResolve(false)} />
      </Animated.View>
      <View style={styles.dialogWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.dialog,
            { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
          ]}
        >
          <Text style={styles.title}>{opts?.title}</Text>
          {opts?.message ? <Text style={styles.message}>{opts.message}</Text> : null}
          <View style={styles.row}>
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={() => onResolve(false)}>
              <Text style={styles.cancelTx}>{opts?.cancelLabel ?? 'Cancel'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.confirmBtn, opts?.destructive && styles.destructiveBtn, pressed && styles.pressed]}
              onPress={() => onResolve(true)}
            >
              <Text style={[styles.confirmTx, opts?.destructive && styles.destructiveTx]}>{opts?.confirmLabel ?? 'Confirm'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message) {
      setShown(message);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 180 }).start();
    } else if (shown) {
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [message, shown, anim]);

  if (!shown) return null;
  return (
    <View style={[styles.toastWrap, { bottom: insets.bottom + 78 }]} pointerEvents="none">
      <Animated.View
        style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
      >
        <Text style={styles.toastTx}>{shown}</Text>
      </Animated.View>
    </View>
  );
}

export function useFeedback(): Feedback {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return v;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  dialogWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: { width: '100%', maxWidth: 340, backgroundColor: colors.card, borderRadius: radius.hero, padding: 22 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  message: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground },
  confirmBtn: { backgroundColor: colors.teal },
  destructiveBtn: { backgroundColor: colors.bad },
  pressed: { opacity: 0.85 },
  cancelTx: { fontSize: 15, fontWeight: '700', color: colors.inkSoft },
  confirmTx: { fontSize: 15, fontWeight: '800', color: '#fff' },
  destructiveTx: { color: '#fff' },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, maxWidth: '86%' },
  toastTx: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
