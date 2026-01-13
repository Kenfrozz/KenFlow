"""
KenFlow - Akıllı Mesaj Otomasyonu
Main Python backend for KenFlow application

İşletmeler için tasarlandı:
- Müşteri iletişimini hızlandırır
- Tekrar eden mesajları otomatikleştirir  
- Her seferinde benzersiz, insansı mesajlar oluşturur
- Overlay modu ile klavyeye dokunmadan çalışır

Provides Flask API for Electron frontend and handles keyboard/automation operations
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import database
import random
import re
import pyperclip
import pyautogui
import keyboard
import threading
import time
import sys

try:
    import pygetwindow as gw
    WINDOW_SUPPORT = True
except ImportError:
    WINDOW_SUPPORT = False
    print("Warning: pygetwindow not installed. Window targeting disabled.")

app = Flask(__name__)
CORS(app)

# Global variables
listener_active = False
listener_thread = None
registered_hotkeys = []


def get_active_window_title():
    """Get the title of the currently active window"""
    if not WINDOW_SUPPORT:
        return ""
    try:
        active = gw.getActiveWindow()
        return active.title if active else ""
    except:
        return ""


def is_target_window_active():
    """Check if the current active window is in the target list"""
    settings = database.get_settings()
    target_windows = settings.get('target_windows', '')
    
    # If no targets set or empty, work in all windows
    if not target_windows or target_windows == '[]':
        return True
    
    try:
        import json
        targets = json.loads(target_windows)
        if not targets:
            return True
        
        active_title = get_active_window_title().lower()
        for target in targets:
            if target.lower() in active_title:
                return True
        return False
    except:
        return True


def send_message_action(message_id: int):
    """Execute the send message action for a specific message"""
    # Check if target window is active
    if not is_target_window_active():
        print("Skipped: Target window not active")
        return
    
    settings = database.get_settings()
    message = database.get_message_by_id(message_id)
    processed_text = get_random_template(message_id)
    
    if not processed_text or not message:
        return
    
    try:
        # Get click delay from settings (default 150ms)
        click_delay = int(settings.get('click_delay', 150)) / 1000.0
        
        # Get current window for logging
        target_window = get_active_window_title()
        
        # Type the message
        time.sleep(0.5)
        pyautogui.hotkey('backspace')
        pyperclip.copy(processed_text)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(click_delay)
        
        # Send with Enter if enabled
        enter_enabled = settings.get('enter_enabled', 'true') == 'true'
        if enter_enabled:
            pyautogui.press('enter')
        
        # Log the sent message
        database.log_message_sent(message_id, message['name'], processed_text, target_window)
        
        print(f"Message sent: {processed_text[:50]}...")
    except Exception as e:
        print(f"Error sending message: {e}")


def send_combination_action(combination_id: int):
    """Execute the send combination action - sends messages sequentially"""
    # Check if target window is active (only at start)
    if not is_target_window_active():
        print("Skipped: Target window not active")
        return
    
    combination = database.get_combination_by_id(combination_id)
    if not combination or not combination['items']:
        print("Combination not found or empty")
        return
    
    settings = database.get_settings()
    delay_ms = combination.get('delay_ms', 500)
    
    target_window = get_active_window_title()
    items = combination['items']
    total = len(items)
    
    print(f"Starting combination '{combination['name']}' with {total} messages...")
    
    for index, item in enumerate(items):
        try:
            message_id = item['message_id']
            message = database.get_message_by_id(message_id)
            
            if not message:
                print(f"  Message {index + 1}: NOT FOUND (id={message_id})")
                continue
            
            processed_text = get_random_template(message_id)
            if not processed_text:
                print(f"  Message {index + 1}: No template found for '{message['name']}'")
                continue
            
            # Get click delay from settings
            click_delay = int(settings.get('click_delay', 150)) / 1000.0
            
            # Small delay before typing
            time.sleep(0.3)
            
            # Clear any existing text and paste
            pyautogui.hotkey('backspace')
            pyperclip.copy(processed_text)
            pyautogui.hotkey('ctrl', 'v')
            time.sleep(click_delay)
            
            # Send with Enter if enabled
            enter_enabled = settings.get('enter_enabled', 'true') == 'true'
            if enter_enabled:
                pyautogui.press('enter')
            
            # Log the sent message
            database.log_message_sent(message_id, message['name'], processed_text, target_window)
            
            print(f"  Message {index + 1}/{total}: '{message['name']}' sent")
            
            # Wait before next message (except for last one)
            if index < total - 1:
                wait_time = delay_ms / 1000.0
                print(f"  Waiting {delay_ms}ms before next message...")
                time.sleep(wait_time)
                
        except Exception as e:
            print(f"  Message {index + 1}: ERROR - {e}")
            continue
    
    # Update combination last used
    database.update_combination_last_used(combination_id)
    # Log combination activity
    database.log_activity('sent', 'combination', combination_id, combination['name'])
    
    print(f"Combination '{combination['name']}' completed!")


def start_listener():
    """Start the keyboard listener for trigger keys"""
    global listener_active, registered_hotkeys
    
    if listener_active:
        return
    
    listener_active = True
    
    # Clear any existing hotkeys
    for hotkey in registered_hotkeys:
        try:
            keyboard.remove_hotkey(hotkey)
        except:
            pass
    registered_hotkeys = []
    
    # Get all messages with trigger keys
    messages = database.get_all_messages()
    
    for msg in messages:
        trigger_key = msg.get('trigger_key')
        if trigger_key:
            try:
                # Create a closure to capture message_id
                def create_handler(mid):
                    def handler():
                        if listener_active:
                            send_message_action(mid)
                    return handler
                
                hotkey = keyboard.add_hotkey(trigger_key, create_handler(msg['id']), suppress=False)
                registered_hotkeys.append(hotkey)
                print(f"Registered hotkey '{trigger_key}' for message '{msg['name']}'")
            except Exception as e:
                print(f"Error registering hotkey '{trigger_key}': {e}")
    
    # Get all combinations with trigger keys
    combinations = database.get_all_combinations()
    
    for combo in combinations:
        trigger_key = combo.get('trigger_key')
        if trigger_key:
            try:
                # Create a closure to capture combination_id
                def create_combo_handler(cid):
                    def handler():
                        if listener_active:
                            send_combination_action(cid)
                    return handler
                
                hotkey = keyboard.add_hotkey(trigger_key, create_combo_handler(combo['id']), suppress=False)
                registered_hotkeys.append(hotkey)
                print(f"Registered hotkey '{trigger_key}' for combination '{combo['name']}'")
            except Exception as e:
                print(f"Error registering hotkey '{trigger_key}': {e}")
    
    print(f"Listener started with {len(registered_hotkeys)} hotkeys")


def stop_listener():
    """Stop the keyboard listener"""
    global listener_active, registered_hotkeys
    
    listener_active = False
    
    # Remove all registered hotkeys
    for hotkey in registered_hotkeys:
        try:
            keyboard.remove_hotkey(hotkey)
        except:
            pass
    registered_hotkeys = []
    
    print("Listener stopped")


def process_template(template: str) -> str:
    """
    Process a template and replace pattern placeholders with random values
    Example: "Hello {greeting}! {emoji}" -> "Hello Hi! 😀"
    """
    patterns = database.get_all_patterns()
    pattern_dict = {p['name']: [item['value'] for item in p['items']] for p in patterns}
    
    def replace_pattern(match):
        pattern_name = match.group(1)
        if pattern_name in pattern_dict and pattern_dict[pattern_name]:
            return random.choice(pattern_dict[pattern_name])
        return match.group(0)  # Return original if pattern not found
    
    # Find all {pattern_name} and replace with random value from pattern
    result = re.sub(r'\{(\w+)\}', replace_pattern, template)
    return result


def get_random_template(message_id: int) -> str:
    """Get a random template from a message and process it"""
    message = database.get_message_by_id(message_id)
    if not message or not message['templates']:
        return ""
    
    template = random.choice(message['templates'])
    return process_template(template['content'])


# ==================== MESSAGE ROUTES ====================

@app.route('/api/messages', methods=['GET'])
def get_messages():
    """Get all messages or search"""
    query = request.args.get('search', '')
    if query:
        messages = database.search_messages(query)
    else:
        messages = database.get_all_messages()
    return jsonify(messages)


@app.route('/api/messages', methods=['POST'])
def create_message():
    """Create a new message"""
    data = request.json
    message_id = database.create_message(
        name=data['name'],
        templates=data.get('templates', []),
        trigger_key=data.get('trigger_key'),
        icon=data.get('icon')
    )
    # Log activity
    database.log_activity('created', 'message', message_id, data['name'])
    return jsonify({'id': message_id, 'success': True})


@app.route('/api/messages/<int:message_id>', methods=['GET'])
def get_message(message_id):
    """Get a single message"""
    message = database.get_message_by_id(message_id)
    if message:
        return jsonify(message)
    return jsonify({'error': 'Message not found'}), 404


@app.route('/api/messages/<int:message_id>', methods=['PUT'])
def update_message(message_id):
    """Update a message"""
    data = request.json
    success = database.update_message(
        message_id=message_id,
        name=data['name'],
        templates=data.get('templates', []),
        trigger_key=data.get('trigger_key'),
        icon=data.get('icon')
    )
    # Log activity
    database.log_activity('edited', 'message', message_id, data['name'])
    return jsonify({'success': success})


@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    """Delete a message"""
    # Get message name before deleting
    message = database.get_message_by_id(message_id)
    message_name = message['name'] if message else 'Deleted message'
    
    success = database.delete_message(message_id)
    # Log activity
    database.log_activity('deleted', 'message', message_id, message_name)
    return jsonify({'success': success})


@app.route('/api/messages/<int:message_id>/copy', methods=['POST'])
def copy_message(message_id):
    """Copy a random processed template to clipboard"""
    processed_text = get_random_template(message_id)
    if processed_text:
        pyperclip.copy(processed_text)
        return jsonify({'success': True, 'text': processed_text})
    return jsonify({'success': False, 'error': 'No templates found'})


# ==================== PATTERN ROUTES ====================

@app.route('/api/patterns', methods=['GET'])
def get_patterns():
    """Get all patterns"""
    patterns = database.get_all_patterns()
    return jsonify(patterns)


@app.route('/api/patterns', methods=['POST'])
def create_pattern():
    """Create a new pattern"""
    data = request.json
    try:
        pattern_id = database.create_pattern(
            name=data['name'],
            items=data.get('items', [])
        )
        # Log activity
        database.log_activity('created', 'pattern', pattern_id, data['name'])
        return jsonify({'id': pattern_id, 'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/patterns/<int:pattern_id>', methods=['PUT'])
def update_pattern(pattern_id):
    """Update a pattern"""
    data = request.json
    success = database.update_pattern(
        pattern_id=pattern_id,
        name=data['name'],
        items=data.get('items', [])
    )
    # Log activity
    database.log_activity('edited', 'pattern', pattern_id, data['name'])
    return jsonify({'success': success})


@app.route('/api/patterns/<int:pattern_id>', methods=['DELETE'])
def delete_pattern(pattern_id):
    """Delete a pattern"""
    # Get pattern name before deleting
    pattern = database.get_pattern_by_name_or_id(pattern_id)
    pattern_name = pattern['name'] if pattern else 'Deleted pattern'
    
    success = database.delete_pattern(pattern_id)
    # Log activity
    database.log_activity('deleted', 'pattern', pattern_id, pattern_name)
    return jsonify({'success': success})


# ==================== SETTINGS ROUTES ====================

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    settings = database.get_settings()
    return jsonify(settings)


@app.route('/api/settings', methods=['PUT', 'POST'])
def update_settings():
    """Update settings"""
    data = request.json
    try:
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
            
        for key, value in data.items():
            database.update_setting(key, str(value))
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500





# ==================== AUTO-CLICKER ROUTES ====================

@app.route('/api/send-message/<int:message_id>', methods=['POST'])
def send_message(message_id):
    """Send a message using auto-click"""
    try:
        send_message_action(message_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ==================== LISTENER ROUTES ====================

@app.route('/api/listener/status', methods=['GET'])
def get_listener_status():
    """Get the current listener status"""
    global listener_active, registered_hotkeys
    return jsonify({
        'active': listener_active,
        'hotkey_count': len(registered_hotkeys)
    })


@app.route('/api/listener/start', methods=['POST'])
def start_listener_route():
    """Start the keyboard listener"""
    try:
        start_listener()
        return jsonify({'success': True, 'active': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/listener/stop', methods=['POST'])
def stop_listener_route():
    """Stop the keyboard listener"""
    try:
        stop_listener()
        return jsonify({'success': True, 'active': False})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/listener/refresh', methods=['POST'])
def refresh_listener_route():
    """Refresh the keyboard listener (reload hotkeys)"""
    global listener_active
    try:
        if listener_active:
            stop_listener()
            start_listener()
        return jsonify({'success': True, 'active': listener_active})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ==================== WINDOW ROUTES ====================

@app.route('/api/windows', methods=['GET'])
def get_windows():
    """Get list of all open windows"""
    if not WINDOW_SUPPORT:
        return jsonify({'windows': [], 'error': 'Window support not available'})
    
    try:
        all_windows = gw.getAllWindows()
        # Filter out empty titles and system windows
        windows = []
        seen_titles = set()
        for w in all_windows:
            title = w.title.strip()
            if title and title not in seen_titles and len(title) > 2:
                # Skip some common system windows
                if title not in ['Program Manager', 'Windows Input Experience']:
                    windows.append(title)
                    seen_titles.add(title)
        
        return jsonify({'windows': sorted(windows)})
    except Exception as e:
        return jsonify({'windows': [], 'error': str(e)})


@app.route('/api/windows/active', methods=['GET'])
def get_active_window():
    """Get the currently active window title"""
    title = get_active_window_title()
    return jsonify({'title': title})


# ==================== DASHBOARD ROUTES ====================

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        stats = database.get_dashboard_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/period', methods=['GET'])
def get_period_stats():
    """Get message statistics for specified period"""
    try:
        days = request.args.get('days', 7, type=int)
        stats = database.get_period_stats(days)
        total = database.get_period_total(days)
        return jsonify({'stats': stats, 'total': total})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/logs', methods=['GET'])
def get_recent_logs():
    """Get recent message logs"""
    try:
        limit = request.args.get('limit', 10, type=int)
        logs = database.get_recent_logs(limit)
        return jsonify(logs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/recent', methods=['GET'])
def get_recent_messages():
    """Get recently used messages"""
    try:
        limit = request.args.get('limit', 5, type=int)
        messages = database.get_recent_messages(limit)
        return jsonify(messages)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/favorites', methods=['GET'])
def get_favorite_messages():
    """Get favorite messages"""
    try:
        messages = database.get_favorite_messages()
        return jsonify(messages)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/messages/<int:message_id>/favorite', methods=['POST'])
def toggle_favorite(message_id):
    """Toggle favorite status of a message"""
    try:
        is_favorite = database.toggle_favorite(message_id)
        return jsonify({'success': True, 'is_favorite': is_favorite})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/dashboard/tip', methods=['GET'])
def get_random_tip():
    """Get a random tip"""
    try:
        tip = database.get_random_tip()
        return jsonify({'tip': tip})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/patterns', methods=['GET'])
def get_most_used_patterns():
    """Get most used patterns"""
    try:
        limit = request.args.get('limit', 5, type=int)
        patterns = database.get_most_used_patterns(limit)
        return jsonify(patterns)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== COMBINATION ROUTES ====================

@app.route('/api/combinations', methods=['GET'])
def get_combinations():
    """Get all combinations"""
    combinations = database.get_all_combinations()
    return jsonify(combinations)


@app.route('/api/combinations', methods=['POST'])
def create_combination():
    """Create a new combination"""
    data = request.json
    combination_id = database.create_combination(
        name=data['name'],
        message_ids=data.get('message_ids', []),
        trigger_key=data.get('trigger_key'),
        delay_ms=data.get('delay_ms', 500),
        icon=data.get('icon')
    )
    # Log activity
    database.log_activity('created', 'combination', combination_id, data['name'])
    return jsonify({'id': combination_id, 'success': True})


@app.route('/api/combinations/<int:combination_id>', methods=['GET'])
def get_combination(combination_id):
    """Get a single combination"""
    combination = database.get_combination_by_id(combination_id)
    if combination:
        return jsonify(combination)
    return jsonify({'error': 'Combination not found'}), 404


@app.route('/api/combinations/<int:combination_id>', methods=['PUT'])
def update_combination(combination_id):
    """Update a combination"""
    data = request.json
    success = database.update_combination(
        combination_id=combination_id,
        name=data['name'],
        message_ids=data.get('message_ids', []),
        trigger_key=data.get('trigger_key'),
        delay_ms=data.get('delay_ms', 500),
        icon=data.get('icon')
    )
    # Log activity
    database.log_activity('edited', 'combination', combination_id, data['name'])
    return jsonify({'success': success})


@app.route('/api/combinations/<int:combination_id>', methods=['DELETE'])
def delete_combination(combination_id):
    """Delete a combination"""
    # Get combination name before deleting
    combination = database.get_combination_by_id(combination_id)
    combination_name = combination['name'] if combination else 'Deleted combination'
    
    success = database.delete_combination(combination_id)
    # Log activity
    database.log_activity('deleted', 'combination', combination_id, combination_name)
    return jsonify({'success': success})


@app.route('/api/combinations/<int:combination_id>/favorite', methods=['POST'])
def toggle_combination_favorite(combination_id):
    """Toggle favorite status of a combination"""
    try:
        is_favorite = database.toggle_combination_favorite(combination_id)
        return jsonify({'success': True, 'is_favorite': is_favorite})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/send-combination/<int:combination_id>', methods=['POST'])
def send_combination(combination_id):
    """Send a combination (execute all messages sequentially)"""
    try:
        # Run in a separate thread to not block the response
        import threading
        thread = threading.Thread(target=send_combination_action, args=(combination_id,))
        thread.start()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    import sys
    import os
    
    # Check if running as packaged exe (no console)
    is_packaged = getattr(sys, 'frozen', False)
    
    # Redirect stdout/stderr to devnull when packaged (no console window)
    if is_packaged:
        # Create a null writer for when there's no console
        class NullWriter:
            def write(self, s): pass
            def flush(self): pass
        
        sys.stdout = NullWriter()
        sys.stderr = NullWriter()
    
    # Initialize database on startup
    if not is_packaged:
        print("="*50)
        print("KenFlow - Smart Message Automation")
        print("="*50)
        print(f"Database: {database.DATABASE_PATH}")
    
    database.init_database()
    
    if not is_packaged:
        print("Starting KenFlow Backend Server...")
        print("Server running at http://localhost:5000")
    
    # Run Flask with Werkzeug banner disabled when packaged
    import logging
    if is_packaged:
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)
    
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True)
