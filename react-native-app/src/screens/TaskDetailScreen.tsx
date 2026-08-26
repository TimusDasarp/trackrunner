import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { ActivityIndicator, Button, Card, Chip, IconButton, Modal, Portal, RadioButton, Snackbar, TextInput, TouchableRipple } from 'react-native-paper';
import { useTasks } from '../hooks/useTasks';
import { api } from '../services/api';
import type { IncompleteReason, RunnerTask, TaskAttachment } from '../types';

const incompleteReasonOptions: Array<{ value: IncompleteReason; label: string }> = [
  { value: 'client_unavailable', label: 'Client unavailable' },
  { value: 'client_requested_reschedule', label: 'Client requested reschedule' },
  { value: 'address_issue', label: 'Address issue' },
  { value: 'access_denied', label: 'Access denied' },
  { value: 'runner_issue', label: 'Runner issue' },
  { value: 'vehicle_or_device_issue', label: 'Vehicle or device issue' },
  { value: 'safety_issue', label: 'Safety issue' },
  { value: 'other', label: 'Other' },
];

export default function TaskDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [task, setTask] = useState<RunnerTask>(route.params.task);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [incompleteSheetVisible, setIncompleteSheetVisible] = useState(false);
  const [incompleteReason, setIncompleteReason] = useState<IncompleteReason | null>(null);
  const [incompleteNote, setIncompleteNote] = useState('');
  const [submittingIncomplete, setSubmittingIncomplete] = useState(false);
  const [acknowledgementUndoVisible, setAcknowledgementUndoVisible] = useState(false);
  const [statusBeforeAcknowledgement, setStatusBeforeAcknowledgement] = useState<RunnerTask['status'] | null>(null);
  const incompleteReasonsScrollRef = useRef<ScrollView>(null);
  const { update } = useTasks();
  const priority = priorityMeta(task.priority);

  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      setAttachments(await api.getTaskAttachments(task.id));
    } catch (error: any) {
      setAttachmentsError(error?.message || 'Please check your connection and try again.');
    } finally {
      setAttachmentsLoading(false);
    }
  }, [task.id]);

  useEffect(() => { void loadAttachments(); }, [loadAttachments]);

  useEffect(() => {
    if (incompleteReason !== 'other') return;
    const scrollTimer = setTimeout(() => incompleteReasonsScrollRef.current?.scrollToEnd({ animated: true }), 180);
    return () => clearTimeout(scrollTimer);
  }, [incompleteReason]);

  async function save(status = task.status, documents = task.documents, incomplete?: { reason: IncompleteReason; note?: string }) {
    try {
      const updated = await update(task, status, documents, incomplete);
      setTask(updated);
      return true;
    } catch (error: any) {
      Alert.alert('Could not update task', error?.message || 'Please try again.');
      return false;
    }
  }

  async function submitIncompleteReason() {
    if (!incompleteReason) {
      Alert.alert('Select a reason', 'Choose the reason this task could not be completed.');
      return;
    }
    if (incompleteReason === 'other' && !incompleteNote.trim()) {
      Alert.alert('Add a note', 'A short note is required when you select Other.');
      return;
    }
    setSubmittingIncomplete(true);
    const saved = await save('unable_to_complete', task.documents, { reason: incompleteReason, note: incompleteNote.trim() || undefined });
    setSubmittingIncomplete(false);
    if (saved) setIncompleteSheetVisible(false);
  }

  async function advanceTask() {
    const previousStatus = task.status;
    const saved = await save(nextStatus);
    if (saved && nextStatus === 'acknowledged') {
      setStatusBeforeAcknowledgement(previousStatus);
      setAcknowledgementUndoVisible(true);
    }
  }

  async function undoAcknowledgement() {
    if (!statusBeforeAcknowledgement) return;
    const saved = await save(statusBeforeAcknowledgement);
    if (saved) {
      setAcknowledgementUndoVisible(false);
      setStatusBeforeAcknowledgement(null);
    }
  }

  function openIncompleteSheet() {
    setIncompleteReason(null);
    setIncompleteNote('');
    setIncompleteSheetVisible(true);
  }

  async function navigate() {
    const destination = task.destinationLat != null && task.destinationLon != null
      ? `${task.destinationLat},${task.destinationLon}`
      : task.clientAddress;
    const encoded = encodeURIComponent(destination);
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    try {
      await Linking.openURL(Platform.OS === 'android' ? `google.navigation:q=${encoded}&mode=d` : fallback);
    } catch {
      await Linking.openURL(fallback).catch(() => Alert.alert('Maps unavailable', 'Install or enable a maps app to navigate to this task.'));
    }
  }

  async function openAttachment(attachment: TaskAttachment) {
    setOpeningAttachmentId(attachment.id);
    try {
      const url = await api.getTaskAttachmentDownloadUrl(task.id, attachment.id);
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert('Could not open file', error?.message || 'Please try again.');
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  const nextStatus = task.status === 'sent' ? 'acknowledged' : task.status === 'acknowledged' ? 'in_progress' : 'completed';
  const nextAction = task.status === 'sent' ? 'Acknowledge task' : task.status === 'acknowledged' ? 'Start task' : 'Mark completed';
  const canUpdateStatus = task.status !== 'completed' && task.status !== 'unable_to_complete';

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 18 }}>
      <View className="flex-row items-center gap-3 mb-1">
        <IconButton icon="arrow-left" mode="contained" onPress={() => navigation.goBack()} accessibilityLabel="Back to tasks" />
        <Text className="text-3xl font-bold text-slate-900 flex-1" numberOfLines={1}>Task details</Text>
      </View>

      <Card mode="elevated" style={{ borderLeftWidth: 7, borderLeftColor: priority.color }}>
        <Card.Content style={{ gap: 15, paddingVertical: 20 }}>
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip compact icon="alert-circle" textStyle={{ color: priority.color, fontWeight: '700' }} style={{ backgroundColor: priority.surface }}>{priority.label}</Chip>
            <Chip compact icon="send">{task.status.replace('_', ' ')}</Chip>
          </View>
          <Text className="text-2xl font-bold text-slate-900">{task.clientName}</Text>
          <View className="flex-row items-start gap-2"><IconButton icon="map-marker-outline" size={21} iconColor="#64748B" style={{ margin: 0 }} /><Text className="flex-1 text-base leading-6 text-slate-600">{task.clientAddress}</Text></View>
          <View className="flex-row flex-wrap gap-2">
            <Button mode="outlined" icon="phone" onPress={() => Linking.openURL(`tel:${task.clientPhone}`)}>{task.clientPhone}</Button>
            <Button mode="contained-tonal" icon="navigation" onPress={navigate}>Navigate</Button>
          </View>
        </Card.Content>
      </Card>

      {!!task.notes && <Card mode="contained"><Card.Content style={{ gap: 8 }}><Text className="text-xs font-semibold text-slate-500">DELIVERY NOTES</Text><Text className="text-base text-slate-700">{task.notes}</Text></Card.Content></Card>}

      {(attachmentsLoading || attachmentsError || attachments.length > 0) && <Card mode="contained">
        <Card.Content style={{ gap: 12 }}>
          <View className="flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Attached files</Text>{attachments.length > 0 && <Chip compact icon="paperclip">{attachments.length}</Chip>}</View>
          {attachmentsLoading ? <View className="flex-row items-center gap-2 py-1"><ActivityIndicator size="small" /><Text className="text-sm text-slate-500">Loading files…</Text></View> : attachmentsError ? <View style={{ gap: 8 }}><Text className="text-sm text-red-700">Could not load attached files.</Text><Button mode="outlined" compact icon="refresh" onPress={loadAttachments}>Try again</Button></View> : attachments.map((attachment) => <View key={attachment.id} className="rounded-xl border border-slate-200 bg-white p-2"><Button mode="text" icon="file-download-outline" contentStyle={{ justifyContent: 'flex-start', minHeight: 42 }} onPress={() => openAttachment(attachment)} loading={openingAttachmentId === attachment.id} disabled={openingAttachmentId != null}>{attachment.name}<Text className="text-slate-500"> · {formatFileSize(attachment.sizeBytes)}</Text></Button></View>)}
        </Card.Content>
      </Card>}

      <Card mode="contained">
        <Card.Content style={{ gap: 14 }}>
          <View className="flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Documents</Text><Text className="text-sm text-slate-500">{task.documents.filter((document) => document.collected).length}/{task.documents.length} collected</Text></View>
          {task.documents.length === 0 ? <Text className="text-slate-500">No documents required for this task.</Text> : task.documents.map((document) => <Chip key={document.id} icon={document.collected ? 'check-circle' : 'circle-outline'} selected={document.collected} onPress={() => save(task.status, task.documents.map((item) => item.id === document.id ? { ...item, collected: !item.collected } : item))}>{document.name}</Chip>)}
        </Card.Content>
      </Card>

      {canUpdateStatus && <View style={{ gap: 14 }}>
        <Button mode="contained" icon="arrow-right" contentStyle={{ height: 52 }} onPress={advanceTask}>{nextAction}</Button>
        <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
          <Text className="text-sm font-semibold text-slate-600">Need to stop this task?</Text>
          <Button mode="outlined" icon="close-octagon" textColor="#B91C1C" contentStyle={{ height: 48 }} onPress={openIncompleteSheet}>Unable to complete</Button>
        </View>
      </View>}
      <Portal>
        <Modal visible={incompleteSheetVisible} onDismiss={() => !submittingIncomplete && setIncompleteSheetVisible(false)} contentContainerStyle={{ margin: 16, maxHeight: '92%' }}>
          <Animated.View entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: 'white', borderRadius: 24, overflow: 'hidden', elevation: 8, maxHeight: '100%' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 }}>
                <View style={{ alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' }} />
                <Text className="text-xl font-bold text-slate-900">Reason for Task Cancellation</Text>
              </View>
              <ScrollView ref={incompleteReasonsScrollRef} style={{ maxHeight: '55%' }} contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
                <RadioButton.Group value={incompleteReason ?? ''} onValueChange={(value) => setIncompleteReason(value as IncompleteReason)}>
                  <View style={{ gap: 6 }}>
                    {incompleteReasonOptions.map((option) => {
                      const selected = incompleteReason === option.value;
                      const isSafetyIssue = option.value === 'safety_issue';
                      return <TouchableRipple key={option.value} onPress={() => setIncompleteReason(option.value)} disabled={submittingIncomplete} borderless style={{ borderRadius: 14 }}>
                        <View style={{ minHeight: 52, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: selected ? (isSafetyIssue ? '#DC2626' : '#2563EB') : '#E2E8F0', backgroundColor: selected ? (isSafetyIssue ? '#FEF2F2' : '#EFF6FF') : '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <RadioButton value={option.value} status={selected ? 'checked' : 'unchecked'} color={isSafetyIssue ? '#DC2626' : '#2563EB'} disabled={submittingIncomplete} />
                          <Text className="flex-1 text-base font-semibold text-slate-900">{option.label}</Text>
                        </View>
                      </TouchableRipple>;
                    })}
                  </View>
                </RadioButton.Group>
                {incompleteReason === 'other' && <Animated.View entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)} style={{ gap: 8, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 14, backgroundColor: '#FEF2F2', padding: 10 }}>
                  <Text className="text-sm font-semibold text-red-800">Add a note to cancel this task</Text>
                  <TextInput mode="outlined" label="Required note" value={incompleteNote} onChangeText={setIncompleteNote} multiline numberOfLines={3} maxLength={1000} editable={!submittingIncomplete} placeholder="Tell dispatch what happened" outlineColor="#FCA5A5" activeOutlineColor="#DC2626" />
                </Animated.View>}
              </ScrollView>
              <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 8 }}>
                <Button mode="outlined" compact contentStyle={{ height: 46 }} onPress={() => setIncompleteSheetVisible(false)} disabled={submittingIncomplete} style={{ flex: 1 }}>Keep task open</Button>
                <Button mode="contained" buttonColor="#B91C1C" compact icon="close-octagon" contentStyle={{ height: 46 }} loading={submittingIncomplete} disabled={submittingIncomplete || !incompleteReason || (incompleteReason === 'other' && !incompleteNote.trim())} onPress={submitIncompleteReason} style={{ flex: 1 }}>Cancel task</Button>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </Modal>
      </Portal>
      <Snackbar visible={acknowledgementUndoVisible} duration={6000} onDismiss={() => setAcknowledgementUndoVisible(false)} action={{ label: 'Undo', onPress: undoAcknowledgement }}>
        Task acknowledged
      </Snackbar>
    </ScrollView>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function priorityMeta(priority?: RunnerTask['priority']) {
  if (priority === 'urgent') return { label: 'Urgent', color: '#DC2626', surface: '#FEE2E2' };
  if (priority === 'high') return { label: 'High', color: '#B45309', surface: '#FEF3C7' };
  return { label: 'Normal', color: '#2563EB', surface: '#DBEAFE' };
}
