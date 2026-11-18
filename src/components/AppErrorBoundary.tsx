import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
  cacheCleared: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
    cacheCleared: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[AppErrorBoundary] Unhandled error caught at root:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
      cacheCleared: false,
    });
  };

  private handleClearCache = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        for (const f of files) {
          try {
            await FileSystem.deleteAsync(`${cacheDir}${f}`, { idempotent: true });
          } catch (_) {}
        }
      }
      this.setState({ cacheCleared: true });
      setTimeout(() => {
        this.handleReset();
      }, 600);
    } catch (e) {
      console.warn('[AppErrorBoundary] Failed to clear temp cache:', e);
      this.handleReset();
    }
  };

  private handleCopyDiagnostics = async () => {
    const { error, errorInfo } = this.state;
    const diagnosticText = `=== FileLens Pro Diagnostic Log ===\nTimestamp: ${new Date().toISOString()}\nError: ${error?.name}: ${error?.message}\nStack: ${error?.stack || 'No stack'}\nComponent Stack: ${errorInfo?.componentStack || 'No component stack'}\n`;
    
    try {
      await Clipboard.setStringAsync(diagnosticText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch (_) {
      try {
        await Share.share({ message: diagnosticText, title: 'FileLens Pro Diagnostic Log' });
      } catch (_) {}
    }
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, copied, cacheCleared } = this.state;

      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#0B1120" />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Icon */}
            <View style={styles.iconCircle}>
              <Ionicons name="shield-half" size={44} color="#38BDF8" />
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              FileLens Pro caught an unexpected rendering issue. Your files and database records are completely safe and untouched.
            </Text>

            {/* Recovery Actions Card */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>Recovery Options</Text>

              {/* Reload App Button */}
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={this.handleReset}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.primaryButtonText}>Reload Screen</Text>
              </TouchableOpacity>

              {/* Clear Temp Cache Button */}
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={this.handleClearCache}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={cacheCleared ? "checkmark-circle" : "trash-bin-outline"}
                  size={19}
                  color={cacheCleared ? "#10B981" : "#F59E0B"}
                  style={styles.buttonIcon}
                />
                <Text style={[styles.secondaryButtonText, cacheCleared && { color: "#10B981" }]}>
                  {cacheCleared ? "Temp Cache Cleared!" : "Clear Temp Cache & Reload"}
                </Text>
              </TouchableOpacity>

              {/* Copy Diagnostic Log */}
              <TouchableOpacity
                style={[styles.button, styles.outlineButton]}
                onPress={this.handleCopyDiagnostics}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copied ? "checkmark-done" : "copy-outline"}
                  size={18}
                  color={copied ? "#10B981" : "#94A3B8"}
                  style={styles.buttonIcon}
                />
                <Text style={[styles.outlineButtonText, copied && { color: "#10B981" }]}>
                  {copied ? "Diagnostic Log Copied!" : "Copy Diagnostic Log"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Details Toggle */}
            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => this.setState({ showDetails: !showDetails })}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? "Hide Technical Details" : "View Technical Details"}
              </Text>
              <Ionicons
                name={showDetails ? "chevron-up" : "chevron-down"}
                size={16}
                color="#64748B"
              />
            </TouchableOpacity>

            {showDetails && (
              <View style={styles.detailsCard}>
                <Text style={styles.errorName}>
                  {error?.name || "Error"}: {error?.message || "Unknown error"}
                </Text>
                {!!error?.stack && (
                  <Text style={styles.stackText}>{error.stack.trim()}</Text>
                )}
                {!!errorInfo?.componentStack && (
                  <Text style={[styles.stackText, { marginTop: 8, color: "#64748B" }]}>
                    {errorInfo.componentStack.trim()}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 36,
    alignItems: 'center',
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 28,
  },
  actionCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    marginBottom: 10,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: '#0284C7',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FBBF24',
  },
  outlineButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 0,
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#CBD5E1',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 10,
  },
  detailsToggleText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  errorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F87171',
    marginBottom: 6,
  },
  stackText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#94A3B8',
    lineHeight: 16,
  },
});
