#!/bin/bash

# Usage helper
show_help() {
    echo "Usage:"
    echo "  ./git.sh \"<commit_message>\" [-push]"
    echo "  ./git.sh -pull"
}

# Check if an argument was provided
if [ -z "$1" ]; then
    show_help
    exit 1
fi

# Handle -pull command
if [ "$1" == "-pull" ]; then
    echo "Pulling latest changes from origin main..."
    git pull origin main
    exit 0
fi

# Handle commit
MESSAGE=$1
git add .
git commit -m "$MESSAGE"

# Handle optional push
# We check if the second argument is exactly "-push"
if [ "$2" == "-push" ]; then
    echo "Pushing changes to origin main..."
    git push -u origin main
else
    echo "Changes committed locally (no push requested)."
fi
