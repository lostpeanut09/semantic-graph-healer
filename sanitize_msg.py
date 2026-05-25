import sys
import re

def sanitize(msg):
    # Remove patterns like (phase-19), phase-19, (19-03), 19-03
    msg = re.sub(r'\(?phase-\d+\)?', '', msg)
    msg = re.sub(r'\(\d{2}-\d{2}\)', '', msg)
    
    # Remove specific planning files
    msg = re.sub(r'\b\d{2}-\d{2}-PLAN\.md\b', 'plan', msg)
    msg = re.sub(r'\bPLAN\.md\b', 'plan', msg)
    msg = re.sub(r'\bSUMMARY\.md\b', 'summary', msg)
    msg = re.sub(r'\.planning/', '', msg)
    
    # Clean up empty parentheses or double spaces/colons resulting from removals
    msg = msg.replace('():', ':')
    msg = msg.replace('()', '')
    msg = re.sub(r':\s*:', ':', msg)
    msg = re.sub(r'\s{2,}', ' ', msg)
    msg = msg.strip()
    
    # If the message starts with a colon (e.g. after removing a scope), remove it
    msg = re.sub(r'^:\s*', '', msg)
    
    # Ensure it's not empty
    if not msg:
        msg = "chore: generic update"
        
    return msg

if __name__ == "__main__":
    original_msg = sys.stdin.read()
    sanitized_msg = sanitize(original_msg)
    sys.stdout.write(sanitized_msg)
