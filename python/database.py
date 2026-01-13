"""
KenFlow - Akıllı Mesaj Otomasyonu
Database module for KenFlow application
Handles all SQLite operations for messages, templates, and patterns

İşletmeler için tasarlandı:
- Müşteri iletişimini hızlandırır
- Tekrar eden mesajları otomatikleştirir
- Her seferinde benzersiz, insansı mesajlar oluşturur
"""

import sqlite3
import os
import json
import sys
from typing import List, Dict, Optional, Any

def get_app_data_path():
    """Get the appropriate app data directory for KenFlow"""
    if sys.platform == 'win32':
        # Windows: %LOCALAPPDATA%/KenFlow
        base_path = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        app_data = os.path.join(base_path, 'KenFlow')
    elif sys.platform == 'darwin':
        # macOS: ~/Library/Application Support/KenFlow
        app_data = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'KenFlow')
    else:
        # Linux: ~/.local/share/KenFlow
        app_data = os.path.join(os.path.expanduser('~'), '.local', 'share', 'KenFlow')
    
    # Create directory if it doesn't exist
    if not os.path.exists(app_data):
        os.makedirs(app_data)
    
    return app_data

# Database path in user's app data folder
APP_DATA_PATH = get_app_data_path()
DATABASE_PATH = os.path.join(APP_DATA_PATH, 'kenflow.db')



def get_connection():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the database with required tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            trigger_key TEXT,
            is_favorite INTEGER DEFAULT 0,
            last_used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Templates table (linked to messages)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        )
    ''')
    
    # Patterns table (for pattern lists like emoji, greetings, etc.)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Pattern items table (individual items in a pattern list)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pattern_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_id INTEGER NOT NULL,
            value TEXT NOT NULL,
            FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
        )
    ''')
    
    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    # Activity logs table (for tracking all activities)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_type TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id INTEGER,
            item_name TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Legacy message_logs table (keep for migration)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS message_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            message_name TEXT NOT NULL,
            sent_text TEXT,
            target_window TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
        )
    ''')
    
    # Tips table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        )
    ''')
    
    # Combinations table (for sequential message sending)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS combinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            trigger_key TEXT,
            delay_ms INTEGER DEFAULT 500,
            is_favorite INTEGER DEFAULT 0,
            last_used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Combination items table (ordered messages in a combination)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS combination_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            combination_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            order_index INTEGER NOT NULL,
            FOREIGN KEY (combination_id) REFERENCES combinations(id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        )
    ''')
    
    # Initialize default settings
    default_settings = {
        'click_delay': '150',
        'enter_enabled': 'true',
        'click_delay': '150',
        'enter_enabled': 'true',
        'combination_delay': '500',
        'icon_only_mode': 'false'
    }
    
    for key, value in default_settings.items():
        cursor.execute('''
            INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
        ''', (key, value))
    
    # Initialize default tips
    default_tips = [
        '{kalip} şeklinde kalıplar kullanarak mesajlarınızı çeşitlendirebilirsiniz!',
        'Bir mesaja birden fazla template ekleyerek her seferinde farklı mesaj gönderin.',
        'Hotkey atayarak tek tuşla mesaj gönderebilirsiniz.',
        'Pencere hedefleme ile sadece belirli uygulamalarda çalışın.',
        'Overlay modunu kullanarak kompakt arayüzle hızlı erişim sağlayın.',
        'Enter ile gönderimi kapatarak mesajı sadece yazabilirsiniz.',
        'Kalıplara emoji ekleyerek mesajlarınızı renklendirebilirsiniz! 🎉',
        'Aynı hotkey\'i birden fazla mesaja atamaktan kaçının.'
    ]
    
    cursor.execute('SELECT COUNT(*) FROM tips')
    if cursor.fetchone()[0] == 0:
        for tip in default_tips:
            cursor.execute('INSERT INTO tips (content) VALUES (?)', (tip,))
    
    conn.commit()
    conn.close()
    
    # Run migrations for existing databases
    migrate_database()


def migrate_database():
    """Add new columns to existing tables if they don't exist"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check and add is_favorite column to messages
    cursor.execute("PRAGMA table_info(messages)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'is_favorite' not in columns:
        cursor.execute('ALTER TABLE messages ADD COLUMN is_favorite INTEGER DEFAULT 0')
    
    if 'last_used_at' not in columns:
        cursor.execute('ALTER TABLE messages ADD COLUMN last_used_at TIMESTAMP')
    
    if 'icon' not in columns:
        cursor.execute('ALTER TABLE messages ADD COLUMN icon TEXT')

    # Check and add icon column to combinations
    cursor.execute("PRAGMA table_info(combinations)")
    combo_columns = [col[1] for col in cursor.fetchall()]

    if 'icon' not in combo_columns:
        cursor.execute('ALTER TABLE combinations ADD COLUMN icon TEXT')
    
    conn.commit()
    conn.close()


# ==================== MESSAGE OPERATIONS ====================

def get_all_messages() -> List[Dict]:
    """Get all messages with their templates"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM messages ORDER BY created_at DESC')
    messages = cursor.fetchall()
    
    result = []
    for msg in messages:
        msg_dict = dict(msg)
        cursor.execute('SELECT * FROM templates WHERE message_id = ?', (msg['id'],))
        msg_dict['templates'] = [dict(t) for t in cursor.fetchall()]
        result.append(msg_dict)
    
    conn.close()
    return result


def search_messages(query: str) -> List[Dict]:
    """Search messages by name or template content"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT DISTINCT m.* FROM messages m
        LEFT JOIN templates t ON m.id = t.message_id
        WHERE m.name LIKE ? OR t.content LIKE ?
        ORDER BY m.created_at DESC
    ''', (f'%{query}%', f'%{query}%'))
    
    messages = cursor.fetchall()
    
    result = []
    for msg in messages:
        msg_dict = dict(msg)
        cursor.execute('SELECT * FROM templates WHERE message_id = ?', (msg['id'],))
        msg_dict['templates'] = [dict(t) for t in cursor.fetchall()]
        result.append(msg_dict)
    
    conn.close()
    return result


def create_message(name: str, templates: List[str], trigger_key: str = None, icon: str = None) -> int:
    """Create a new message with templates"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        'INSERT INTO messages (name, trigger_key, icon) VALUES (?, ?, ?)',
        (name, trigger_key, icon)
    )
    message_id = cursor.lastrowid
    
    for template in templates:
        cursor.execute(
            'INSERT INTO templates (message_id, content) VALUES (?, ?)',
            (message_id, template)
        )
    
    conn.commit()
    conn.close()
    return message_id


def update_message(message_id: int, name: str, templates: List[str], trigger_key: str = None, icon: str = None) -> bool:
    """Update an existing message and its templates"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        'UPDATE messages SET name = ?, trigger_key = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        (name, trigger_key, icon, message_id)
    )
    
    # Delete existing templates and add new ones
    cursor.execute('DELETE FROM templates WHERE message_id = ?', (message_id,))
    
    for template in templates:
        cursor.execute(
            'INSERT INTO templates (message_id, content) VALUES (?, ?)',
            (message_id, template)
        )
    
    conn.commit()
    conn.close()
    return True


def delete_message(message_id: int) -> bool:
    """Delete a message and its templates"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM messages WHERE id = ?', (message_id,))
    
    conn.commit()
    conn.close()
    return True


def get_message_by_id(message_id: int) -> Optional[Dict]:
    """Get a single message by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()
    
    if not msg:
        conn.close()
        return None
    
    msg_dict = dict(msg)
    cursor.execute('SELECT * FROM templates WHERE message_id = ?', (message_id,))
    msg_dict['templates'] = [dict(t) for t in cursor.fetchall()]
    
    conn.close()
    return msg_dict


# ==================== PATTERN OPERATIONS ====================

def get_all_patterns() -> List[Dict]:
    """Get all patterns with their items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM patterns ORDER BY name')
    patterns = cursor.fetchall()
    
    result = []
    for pattern in patterns:
        pattern_dict = dict(pattern)
        cursor.execute('SELECT * FROM pattern_items WHERE pattern_id = ?', (pattern['id'],))
        pattern_dict['items'] = [dict(item) for item in cursor.fetchall()]
        result.append(pattern_dict)
    
    conn.close()
    return result


def create_pattern(name: str, items: List[str]) -> int:
    """Create a new pattern with items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('INSERT INTO patterns (name) VALUES (?)', (name,))
    pattern_id = cursor.lastrowid
    
    for item in items:
        cursor.execute(
            'INSERT INTO pattern_items (pattern_id, value) VALUES (?, ?)',
            (pattern_id, item)
        )
    
    conn.commit()
    conn.close()
    return pattern_id


def update_pattern(pattern_id: int, name: str, items: List[str]) -> bool:
    """Update an existing pattern and its items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE patterns SET name = ? WHERE id = ?', (name, pattern_id))
    
    # Delete existing items and add new ones
    cursor.execute('DELETE FROM pattern_items WHERE pattern_id = ?', (pattern_id,))
    
    for item in items:
        cursor.execute(
            'INSERT INTO pattern_items (pattern_id, value) VALUES (?, ?)',
            (pattern_id, item)
        )
    
    conn.commit()
    conn.close()
    return True


def delete_pattern(pattern_id: int) -> bool:
    """Delete a pattern and its items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM patterns WHERE id = ?', (pattern_id,))
    
    conn.commit()
    conn.close()
    return True


def get_pattern_by_name(name: str) -> Optional[Dict]:
    """Get a pattern by name"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM patterns WHERE name = ?', (name,))
    pattern = cursor.fetchone()
    
    if not pattern:
        conn.close()
        return None
    
    pattern_dict = dict(pattern)
    cursor.execute('SELECT * FROM pattern_items WHERE pattern_id = ?', (pattern['id'],))
    pattern_dict['items'] = [dict(item) for item in cursor.fetchall()]
    
    conn.close()
    return pattern_dict


def get_pattern_by_name_or_id(pattern_id: int) -> Optional[Dict]:
    """Get a pattern by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM patterns WHERE id = ?', (pattern_id,))
    pattern = cursor.fetchone()
    
    if not pattern:
        conn.close()
        return None
    
    pattern_dict = dict(pattern)
    cursor.execute('SELECT * FROM pattern_items WHERE pattern_id = ?', (pattern['id'],))
    pattern_dict['items'] = [dict(item) for item in cursor.fetchall()]
    
    conn.close()
    return pattern_dict


# ==================== SETTINGS OPERATIONS ====================

def get_settings() -> Dict[str, str]:
    """Get all settings"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM settings')
    settings = cursor.fetchall()
    
    conn.close()
    return {s['key']: s['value'] for s in settings}


def update_setting(key: str, value: str) -> bool:
    """Update a setting value"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        (key, value)
    )
    
    conn.commit()
    conn.close()
    return True


# ==================== DASHBOARD OPERATIONS ====================

def get_dashboard_stats() -> Dict:
    """Get statistics for dashboard"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Total messages
    cursor.execute('SELECT COUNT(*) FROM messages')
    total_messages = cursor.fetchone()[0]
    
    # Total templates
    cursor.execute('SELECT COUNT(*) FROM templates')
    total_templates = cursor.fetchone()[0]
    
    # Total patterns
    cursor.execute('SELECT COUNT(*) FROM patterns')
    total_patterns = cursor.fetchone()[0]
    
    # Total combinations
    cursor.execute('SELECT COUNT(*) FROM combinations')
    total_combinations = cursor.fetchone()[0]
    
    # Today's sent messages (from activity_logs)
    cursor.execute('''
        SELECT COUNT(*) FROM activity_logs 
        WHERE activity_type = 'sent' AND date(created_at) = date('now', 'localtime')
    ''')
    today_sent = cursor.fetchone()[0]
    
    # This week's sent messages
    cursor.execute('''
        SELECT COUNT(*) FROM activity_logs 
        WHERE activity_type = 'sent' AND created_at >= datetime('now', '-7 days', 'localtime')
    ''')
    week_sent = cursor.fetchone()[0]
    
    # This month's sent messages
    cursor.execute('''
        SELECT COUNT(*) FROM activity_logs 
        WHERE activity_type = 'sent' AND created_at >= datetime('now', '-30 days', 'localtime')
    ''')
    month_sent = cursor.fetchone()[0]
    
    # Total sent all time
    cursor.execute("SELECT COUNT(*) FROM activity_logs WHERE activity_type = 'sent'")
    total_sent = cursor.fetchone()[0]
    
    # Active hotkeys count (from both messages and combinations)
    cursor.execute('SELECT COUNT(*) FROM messages WHERE trigger_key IS NOT NULL AND trigger_key != ""')
    message_hotkeys = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(*) FROM combinations WHERE trigger_key IS NOT NULL AND trigger_key != ""')
    combo_hotkeys = cursor.fetchone()[0]
    active_hotkeys = message_hotkeys + combo_hotkeys
    
    # Favorite count
    cursor.execute('SELECT COUNT(*) FROM messages WHERE is_favorite = 1')
    favorites_count = cursor.fetchone()[0]
    
    conn.close()
    return {
        'total_messages': total_messages,
        'total_templates': total_templates,
        'total_patterns': total_patterns,
        'total_combinations': total_combinations,
        'today_sent': today_sent,
        'week_sent': week_sent,
        'month_sent': month_sent,
        'total_sent': total_sent,
        'active_hotkeys': active_hotkeys,
        'favorites_count': favorites_count
    }


def get_period_stats(days: int = 7) -> List[Dict]:
    """Get daily message counts for the specified period"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT date(created_at) as day, COUNT(*) as count
        FROM activity_logs
        WHERE activity_type = 'sent' AND created_at >= datetime('now', ? || ' days', 'localtime')
        GROUP BY date(created_at)
        ORDER BY day ASC
    ''', (f'-{days}',))
    
    results = [{'day': row[0], 'count': row[1]} for row in cursor.fetchall()]
    conn.close()
    return results


def get_period_total(days: int = 7) -> int:
    """Get total sent messages for the specified period"""
    conn = get_connection()
    cursor = conn.cursor()
    
    if days == 1:  # Today
        cursor.execute('''
            SELECT COUNT(*) FROM activity_logs 
            WHERE activity_type = 'sent' AND date(created_at) = date('now', 'localtime')
        ''')
    else:
        cursor.execute('''
            SELECT COUNT(*) FROM activity_logs 
            WHERE activity_type = 'sent' AND created_at >= datetime('now', ? || ' days', 'localtime')
        ''', (f'-{days}',))
    
    result = cursor.fetchone()[0]
    conn.close()
    return result


def log_activity(activity_type: str, item_type: str, item_id: int, item_name: str, details: str = None) -> int:
    """Log an activity (sent, created, edited, deleted)"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO activity_logs (activity_type, item_type, item_id, item_name, details)
        VALUES (?, ?, ?, ?, ?)
    ''', (activity_type, item_type, item_id, item_name, details))
    
    log_id = cursor.lastrowid
    
    # If message was sent, update last_used_at
    if activity_type == 'sent' and item_type == 'message':
        cursor.execute('''
            UPDATE messages SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (item_id,))
    
    conn.commit()
    conn.close()
    return log_id


def log_message_sent(message_id: int, message_name: str, sent_text: str, target_window: str = None) -> int:
    """Log a sent message (wrapper for backwards compatibility)"""
    details = target_window if target_window else None
    return log_activity('sent', 'message', message_id, message_name, details)


def get_recent_logs(limit: int = 20) -> List[Dict]:
    """Get recent activity logs"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM activity_logs
        ORDER BY created_at DESC
        LIMIT ?
    ''', (limit,))
    
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return logs


def get_recent_messages(limit: int = 5) -> List[Dict]:
    """Get recently used messages"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM messages 
        WHERE last_used_at IS NOT NULL
        ORDER BY last_used_at DESC
        LIMIT ?
    ''', (limit,))
    
    messages = []
    for msg in cursor.fetchall():
        msg_dict = dict(msg)
        cursor.execute('SELECT * FROM templates WHERE message_id = ?', (msg['id'],))
        msg_dict['templates'] = [dict(t) for t in cursor.fetchall()]
        messages.append(msg_dict)
    
    conn.close()
    return messages


def get_favorite_messages() -> List[Dict]:
    """Get favorite messages"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM messages WHERE is_favorite = 1 ORDER BY name')
    messages = []
    for msg in cursor.fetchall():
        msg_dict = dict(msg)
        cursor.execute('SELECT * FROM templates WHERE message_id = ?', (msg['id'],))
        msg_dict['templates'] = [dict(t) for t in cursor.fetchall()]
        messages.append(msg_dict)
    
    conn.close()
    return messages


def toggle_favorite(message_id: int) -> bool:
    """Toggle favorite status of a message"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT is_favorite FROM messages WHERE id = ?', (message_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    
    new_status = 0 if row[0] == 1 else 1
    cursor.execute('UPDATE messages SET is_favorite = ? WHERE id = ?', (new_status, message_id))
    
    conn.commit()
    conn.close()
    return new_status == 1


def get_random_tip() -> Optional[str]:
    """Get a random active tip"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT content FROM tips WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1')
    row = cursor.fetchone()
    
    conn.close()
    return row[0] if row else None


def get_most_used_patterns(limit: int = 5) -> List[Dict]:
    """Get patterns sorted by usage in templates"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get all patterns with their items
    patterns = get_all_patterns()
    
    # Count usage in templates
    cursor.execute('SELECT content FROM templates')
    all_templates = [row[0] for row in cursor.fetchall()]
    
    pattern_usage = []
    for pattern in patterns:
        count = sum(1 for t in all_templates if '{' + pattern['name'] + '}' in t)
        pattern_usage.append({
            'name': pattern['name'],
            'usage_count': count,
            'items_count': len(pattern['items'])
        })
    
    conn.close()
    
    # Sort by usage and return top N
    pattern_usage.sort(key=lambda x: x['usage_count'], reverse=True)
    return pattern_usage[:limit]


# ==================== COMBINATION OPERATIONS ====================

def get_all_combinations() -> List[Dict]:
    """Get all combinations with their message items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM combinations ORDER BY created_at DESC')
    combinations = cursor.fetchall()
    
    result = []
    for combo in combinations:
        combo_dict = dict(combo)
        cursor.execute('''
            SELECT ci.*, m.name as message_name 
            FROM combination_items ci
            JOIN messages m ON ci.message_id = m.id
            WHERE ci.combination_id = ?
            ORDER BY ci.order_index
        ''', (combo['id'],))
        combo_dict['items'] = [dict(item) for item in cursor.fetchall()]
        result.append(combo_dict)
    
    conn.close()
    return result


def get_combination_by_id(combination_id: int) -> Optional[Dict]:
    """Get a single combination by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM combinations WHERE id = ?', (combination_id,))
    combo = cursor.fetchone()
    
    if not combo:
        conn.close()
        return None
    
    combo_dict = dict(combo)
    cursor.execute('''
        SELECT ci.*, m.name as message_name 
        FROM combination_items ci
        JOIN messages m ON ci.message_id = m.id
        WHERE ci.combination_id = ?
        ORDER BY ci.order_index
    ''', (combination_id,))
    combo_dict['items'] = [dict(item) for item in cursor.fetchall()]
    
    conn.close()
    return combo_dict


def create_combination(name: str, message_ids: List[int], trigger_key: str = None, delay_ms: int = 500, icon: str = None) -> int:
    """Create a new combination with ordered messages"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        'INSERT INTO combinations (name, trigger_key, delay_ms, icon) VALUES (?, ?, ?, ?)',
        (name, trigger_key, delay_ms, icon)
    )
    combination_id = cursor.lastrowid
    
    for index, message_id in enumerate(message_ids):
        cursor.execute(
            'INSERT INTO combination_items (combination_id, message_id, order_index) VALUES (?, ?, ?)',
            (combination_id, message_id, index)
        )
    
    conn.commit()
    conn.close()
    return combination_id


def update_combination(combination_id: int, name: str, message_ids: List[int], trigger_key: str = None, delay_ms: int = 500, icon: str = None) -> bool:
    """Update an existing combination"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        'UPDATE combinations SET name = ?, trigger_key = ?, delay_ms = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        (name, trigger_key, delay_ms, icon, combination_id)
    )
    
    # Delete existing items and add new ones
    cursor.execute('DELETE FROM combination_items WHERE combination_id = ?', (combination_id,))
    
    for index, message_id in enumerate(message_ids):
        cursor.execute(
            'INSERT INTO combination_items (combination_id, message_id, order_index) VALUES (?, ?, ?)',
            (combination_id, message_id, index)
        )
    
    conn.commit()
    conn.close()
    return True


def delete_combination(combination_id: int) -> bool:
    """Delete a combination and its items"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM combinations WHERE id = ?', (combination_id,))
    
    conn.commit()
    conn.close()
    return True


def toggle_combination_favorite(combination_id: int) -> bool:
    """Toggle favorite status of a combination"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT is_favorite FROM combinations WHERE id = ?', (combination_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    
    new_status = 0 if row[0] == 1 else 1
    cursor.execute('UPDATE combinations SET is_favorite = ? WHERE id = ?', (new_status, combination_id))
    
    conn.commit()
    conn.close()
    return new_status == 1


def update_combination_last_used(combination_id: int):
    """Update the last_used_at timestamp for a combination"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE combinations SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (combination_id,))
    
    conn.commit()
    conn.close()


def get_favorite_combinations() -> List[Dict]:
    """Get favorite combinations"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM combinations WHERE is_favorite = 1 ORDER BY name')
    combinations = []
    for combo in cursor.fetchall():
        combo_dict = dict(combo)
        cursor.execute('''
            SELECT ci.*, m.name as message_name 
            FROM combination_items ci
            JOIN messages m ON ci.message_id = m.id
            WHERE ci.combination_id = ?
            ORDER BY ci.order_index
        ''', (combo['id'],))
        combo_dict['items'] = [dict(item) for item in cursor.fetchall()]
        combinations.append(combo_dict)
    
    conn.close()
    return combinations


# Initialize database on module import
init_database()
