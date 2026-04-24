import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

const { width, height } = Dimensions.get('window');

const NOTE_COLORS = [
  '#6C63FF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF',
  '#FF8A5C', '#F38181', '#AA96DA', '#95E1D3', '#FCE38A',
];

const CATEGORIES = ['All', 'General', 'Work', 'Personal', 'Ideas', 'Study', 'Shopping'];

// Database migration function
async function migrateDbIfNeeded(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      color TEXT DEFAULT '#6C63FF',
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SQLiteProvider databaseName="notes.db" onInit={migrateDbIfNeeded}>
        <NotesScreen />
      </SQLiteProvider>
    </View>
  );
}

function NotesScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]);
  const [selectedCategory, setSelectedCategory] = useState('General');
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [viewMode, setViewMode] = useState('grid');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    loadNotes();
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    loadNotes();
  }, [filterCategory, searchQuery]);

  const loadNotes = async () => {
    try {
      let result;
      if (searchQuery.trim()) {
        result = await db.getAllAsync(
          'SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY is_pinned DESC, updated_at DESC',
          [`%${searchQuery}%`, `%${searchQuery}%`]
        );
      } else {
        result = await db.getAllAsync('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC');
      }
      if (filterCategory !== 'All') {
        result = result.filter(n => n.category === filterCategory);
      }
      setNotes(result);
      const countResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM notes');
      setNoteCount(countResult.count);
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotes();
    setRefreshing(false);
  }, [filterCategory, searchQuery]);

  const openModal = (note = null) => {
    if (note) {
      setEditingNote(note);
      setTitle(note.title);
      setContent(note.content);
      setSelectedColor(note.color);
      setSelectedCategory(note.category);
    } else {
      setEditingNote(null);
      setTitle('');
      setContent('');
      setSelectedColor(NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]);
      setSelectedCategory('General');
    }
    setModalVisible(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: height, duration: 300, useNativeDriver: true }).start(() => {
      setModalVisible(false);
      setEditingNote(null);
      setTitle('');
      setContent('');
    });
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('⚠️', 'กรุณาใส่ชื่อบันทึก'); return; }
    if (!content.trim()) { Alert.alert('⚠️', 'กรุณาใส่เนื้อหา'); return; }
    try {
      if (editingNote) {
        await db.runAsync(
          `UPDATE notes SET title=?, content=?, category=?, color=?, updated_at=datetime('now','localtime') WHERE id=?`,
          [title.trim(), content.trim(), selectedCategory, selectedColor, editingNote.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO notes (title, content, category, color) VALUES (?, ?, ?, ?)',
          [title.trim(), content.trim(), selectedCategory, selectedColor]
        );
      }
      closeModal();
      await loadNotes();
    } catch (error) {
      Alert.alert('Error', 'บันทึกไม่สำเร็จ');
      console.error(error);
    }
  };

  const handleDelete = (note) => {
    Alert.alert('🗑️ ลบบันทึก', `ลบ "${note.title}" ?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: async () => {
        await db.runAsync('DELETE FROM notes WHERE id = ?', [note.id]);
        await loadNotes();
      }},
    ]);
  };

  const handleTogglePin = async (note) => {
    await db.runAsync('UPDATE notes SET is_pinned = ? WHERE id = ?', [note.is_pinned ? 0 : 1, note.id]);
    await loadNotes();
  };

  const toggleSearch = () => {
    setIsSearching(!isSearching);
    if (isSearching) setSearchQuery('');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  const getContrastColor = (hexColor) => {
    const hex = (hexColor || '#6C63FF').replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1a1a2e' : '#ffffff';
  };

  const renderNoteCard = ({ item }) => {
    const textColor = getContrastColor(item.color);
    const isGrid = viewMode === 'grid';
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0,1], outputRange: [50,0] }) }] }}>
        <TouchableOpacity
          style={[styles.noteCard, { backgroundColor: item.color }, isGrid ? styles.noteCardGrid : styles.noteCardList]}
          onPress={() => openModal(item)}
          onLongPress={() => handleDelete(item)}
          activeOpacity={0.8}
        >
          {item.is_pinned === 1 && (
            <View style={styles.pinBadge}><Ionicons name="pin" size={12} color={textColor} /></View>
          )}
          <View style={[styles.categoryBadge, { backgroundColor: textColor + '20' }]}>
            <Text style={[styles.categoryBadgeText, { color: textColor }]}>{item.category}</Text>
          </View>
          <Text style={[styles.noteTitle, { color: textColor }]} numberOfLines={isGrid ? 2 : 1}>{item.title}</Text>
          <Text style={[styles.noteContent, { color: textColor + 'CC' }]} numberOfLines={isGrid ? 4 : 2}>{item.content}</Text>
          <View style={styles.noteFooter}>
            <Text style={[styles.noteDate, { color: textColor + '99' }]}>{formatDate(item.updated_at)}</Text>
            <View style={styles.noteActions}>
              <TouchableOpacity onPress={() => handleTogglePin(item)} style={styles.actionBtn}>
                <Ionicons name={item.is_pinned ? 'pin' : 'pin-outline'} size={16} color={textColor + 'AA'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                <Ionicons name="trash-outline" size={16} color={textColor + 'AA'} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>📝 SQLite Notes</Text>
            <Text style={styles.headerSubtitle}>{noteCount} notes saved locally</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleSearch} style={styles.headerBtn}>
              <Ionicons name={isSearching ? 'close' : 'search'} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={styles.headerBtn}>
              <Ionicons name={viewMode === 'grid' ? 'list' : 'grid'} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {isSearching && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#ffffff80" />
            <TextInput style={styles.searchInput} placeholder="ค้นหาบันทึก..." placeholderTextColor="#ffffff60" value={searchQuery} onChangeText={setSearchQuery} autoFocus />
            {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color="#ffffff80" /></TouchableOpacity>}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryScrollContent}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat} style={[styles.categoryChip, filterCategory === cat && styles.categoryChipActive]} onPress={() => setFilterCategory(cat)}>
              <Text style={[styles.categoryChipText, filterCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Notes List */}
      <FlatList
        data={notes}
        renderItem={renderNoteCard}
        keyExtractor={item => item.id.toString()}
        numColumns={viewMode === 'grid' ? 2 : 1}
        key={viewMode}
        contentContainerStyle={[styles.notesList, notes.length === 0 && styles.notesListEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={80} color="#ffffff30" />
            <Text style={styles.emptyTitle}>ยังไม่มีบันทึก</Text>
            <Text style={styles.emptySubtitle}>กดปุ่ม + เพื่อสร้างบันทึกแรก</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" colors={['#6C63FF']} />}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => openModal()} activeOpacity={0.85}>
        <View style={styles.fabGradient}><Ionicons name="add" size={30} color="#fff" /></View>
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="none" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
              <Text style={styles.modalTitle}>{editingNote ? '✏️ แก้ไข' : '✨ บันทึกใหม่'}</Text>
              <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn}><Text style={styles.modalSaveBtnText}>บันทึก</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <TextInput style={styles.inputTitle} placeholder="ชื่อบันทึก..." placeholderTextColor="#ffffff50" value={title} onChangeText={setTitle} maxLength={100} />
              <TextInput style={styles.inputContent} placeholder="เขียนบันทึกที่นี่..." placeholderTextColor="#ffffff40" value={content} onChangeText={setContent} multiline textAlignVertical="top" />
              <Text style={styles.sectionLabel}>หมวดหมู่</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScroll}>
                {CATEGORIES.filter(c => c !== 'All').map(cat => (
                  <TouchableOpacity key={cat} style={[styles.modalCategoryChip, selectedCategory === cat && styles.modalCategoryChipActive]} onPress={() => setSelectedCategory(cat)}>
                    <Text style={[styles.modalCategoryChipText, selectedCategory === cat && styles.modalCategoryChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.sectionLabel}>สี</Text>
              <View style={styles.colorGrid}>
                {NOTE_COLORS.map(color => (
                  <TouchableOpacity key={color} style={[styles.colorOption, { backgroundColor: color }, selectedColor === color && styles.colorOptionSelected]} onPress={() => setSelectedColor(color)}>
                    {selectedColor === color && <Ionicons name="checkmark" size={18} color={getContrastColor(color)} />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.previewCard, { backgroundColor: selectedColor }]}>
                <Text style={[styles.previewLabel, { color: getContrastColor(selectedColor) + '80' }]}>ตัวอย่าง</Text>
                <Text style={[styles.previewTitle, { color: getContrastColor(selectedColor) }]} numberOfLines={1}>{title || 'ชื่อบันทึก'}</Text>
                <Text style={[styles.previewContent, { color: getContrastColor(selectedColor) + 'CC' }]} numberOfLines={2}>{content || 'เนื้อหาจะแสดงที่นี่...'}</Text>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#1a1a2e', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, elevation: 8 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerGreeting: { fontSize: 28, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: '#ffffff70', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffffff15', justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff15', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  categoryScroll: { marginBottom: 4 },
  categoryScrollContent: { gap: 8, paddingRight: 20 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#ffffff10', borderWidth: 1, borderColor: '#ffffff15' },
  categoryChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  categoryChipText: { color: '#ffffff80', fontSize: 13, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  notesList: { padding: 12, paddingBottom: 100 },
  notesListEmpty: { flex: 1 },
  noteCard: { borderRadius: 20, padding: 16, marginBottom: 12, elevation: 4 },
  noteCardGrid: { flex: 1, marginHorizontal: 4, minHeight: 180 },
  noteCardList: { marginHorizontal: 4 },
  pinBadge: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: '#00000020', justifyContent: 'center', alignItems: 'center' },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginBottom: 10 },
  categoryBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  noteTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  noteContent: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  noteFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },
  noteDate: { fontSize: 11, fontWeight: '500' },
  noteActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff60', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#ffffff40', marginTop: 8 },
  fab: { position: 'absolute', bottom: 30, right: 24, elevation: 8 },
  fabGradient: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000080' },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: height * 0.88, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#ffffff10' },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff15', justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalSaveBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  modalSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalBody: { paddingHorizontal: 20, paddingTop: 16 },
  inputTitle: { fontSize: 22, fontWeight: '700', color: '#fff', borderBottomWidth: 1, borderBottomColor: '#ffffff15', paddingBottom: 12, marginBottom: 16 },
  inputContent: { fontSize: 15, color: '#ffffffCC', minHeight: 120, lineHeight: 22, marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#ffffff80', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  colorScroll: { marginBottom: 20 },
  modalCategoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: '#ffffff10', marginRight: 8, borderWidth: 1, borderColor: '#ffffff15' },
  modalCategoryChipActive: { backgroundColor: '#6C63FF30', borderColor: '#6C63FF' },
  modalCategoryChipText: { color: '#ffffff70', fontSize: 13, fontWeight: '600' },
  modalCategoryChipTextActive: { color: '#6C63FF' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  colorOption: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorOptionSelected: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
  previewCard: { borderRadius: 16, padding: 16, marginBottom: 30 },
  previewLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  previewTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  previewContent: { fontSize: 13, lineHeight: 18 },
});
