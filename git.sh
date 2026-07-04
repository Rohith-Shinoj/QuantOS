#!/bin/bash

# Usage helper
show_help() {
    echo "Usage:"
    echo "  ./git.sh \"<commit_message>\"    # Commit without push"
    echo "  ./git.sh --push \"<commit_message>\" # Commit and push"
    echo "  ./git.sh --pull                # Pull from remote"
    echo "  ./git.sh --reset               # Hard reset to last local commit"
    echo "  ./git.sh --resetremote         # Hard reset to last pushed commit"
}

# Function to ask for confirmation
confirm_action() {
    echo "--------------------------------------------------"
    echo "Action to perform: $1"
    echo "Press Enter to continue or Ctrl+C to abort..."
    read -r
}

# Handle Commands
case "$1" in
    --pull)
        confirm_action "git pull"
        git pull
        ;;

    --reset)
        confirm_action "git reset --hard HEAD"
        git reset --hard HEAD
        ;;

    --resetremote)
        confirm_action "git fetch origin && git reset --hard origin/HEAD"
        git fetch origin
        git reset --hard origin/HEAD
        ;;

    --push)
        if [ -z "$2" ]; then
            echo "Error: You must provide a commit message after --push."
            exit 1
        fi
        confirm_action "git add . && git commit -m \"$2\" && git push -u origin HEAD"
        git add .
        git commit -m "$2"
        git push -u origin HEAD
        ;;

    "")
        show_help
        ;;

    *)
        # Default: Treat $1 as commit message
        confirm_action "git add . && git commit -m \"$1\""
        git add .
        git commit -m "$1"
        ;;
esac
