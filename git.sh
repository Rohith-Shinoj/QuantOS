#!/bin/bash

# Usage helper
show_help() {
    echo "Usage:"
    echo "  ./git.sh \"<commit_message>\"    # Commit without push"
    echo "  ./git.sh -push \"<commit_message>\" # Commit and push"
    echo "  ./git.sh -pull                 # Pull from remote"
}

# Check if arguments provided
if [ -z "$1" ]; then
    show_help
    exit 1
fi

# Handle -pull
if [ "$1" == "-pull" ]; then
    echo "Pulling latest changes from origin..."
    git pull
    exit 0
fi

# Handle -push <message>
if [ "$1" == "-push" ]; then
    if [ -z "$2" ]; then
        echo "Error: You must provide a commit message after -push."
        exit 1
    fi
    
    echo "Committing and pushing..."
    git add .
    git commit -m "$2"
    git push -u origin main
    exit 0
fi

# Handle <message> (Standard commit)
echo "Committing locally..."
git add .
git commit -m "$1"
echo "Changes committed locally."
