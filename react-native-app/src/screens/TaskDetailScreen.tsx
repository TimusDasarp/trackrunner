import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Button, Card, Chip, IconButton } from 'react-native-paper';
import { useTasks } from '../hooks/useTasks';
import type { RunnerTask } from '../types';

export default function TaskDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [task, setTask] = useState<RunnerTask>(route.params.task);
  const { update } = useTasks();
  const priority = priorityMeta(task.priority);

  async function save(status = task.status, documents = task.documents) {
    try {
      const updated = await update(task, status, documents);
      setTask(updated);
    } catch (error: any) {
      Alert.alert('Could not update task', error?.message || 'Please try again.');
    }
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

      <Card mode="contained">
        <Card.Content style={{ gap: 14 }}>
          <View className="flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Documents</Text><Text className="text-sm text-slate-500">{task.documents.filter((document) => document.collected).length}/{task.documents.length} collected</Text></View>
          {task.documents.length === 0 ? <Text className="text-slate-500">No documents required for this task.</Text> : task.documents.map((document) => <Chip key={document.id} icon={document.collected ? 'check-circle' : 'circle-outline'} selected={document.collected} onPress={() => save(task.status, task.documents.map((item) => item.id === document.id ? { ...item, collected: !item.collected } : item))}>{document.name}</Chip>)}
        </Card.Content>
      </Card>

      {canUpdateStatus && <View style={{ gap: 10 }}>
        <Button mode="contained" icon="arrow-right" contentStyle={{ height: 52 }} onPress={() => save(nextStatus)}>{nextAction}</Button>
        <Button mode="outlined" icon="close-octagon" textColor="#B91C1C" contentStyle={{ height: 48 }} onPress={() => save('unable_to_complete')}>Unable to complete</Button>
      </View>}
    </ScrollView>
  );
}

function priorityMeta(priority?: RunnerTask['priority']) {
  if (priority === 'urgent') return { label: 'Urgent', color: '#DC2626', surface: '#FEE2E2' };
  if (priority === 'high') return { label: 'High', color: '#B45309', surface: '#FEF3C7' };
  return { label: 'Normal', color: '#2563EB', surface: '#DBEAFE' };
}
