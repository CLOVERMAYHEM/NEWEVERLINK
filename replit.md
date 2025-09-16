# Overview

This is a Discord bot designed for faction-based community management with comprehensive voice time tracking, achievements, and interactive features. The bot facilitates users joining different factions (Laughing Meeks, Unicorn Rapists, Special Activities Directive) and provides competitive features like battles, leaderboards, and time tracking across voice channels.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Bot Framework
- **Discord.js v14**: Modern Discord API wrapper providing slash command support, embed builders, and advanced interaction handling
- **Event-driven architecture**: Bot responds to Discord events like `ready`, `interactionCreate`, and `voiceStateUpdate` for real-time functionality
- **Command collection system**: Dynamic command loading from `/commands` directory for modular functionality
- **Express server**: HTTP server for health checks and potential webhook endpoints

## Database Layer
- **MongoDB**: Primary data persistence using native MongoDB driver for user times, guild settings, sticky messages, and faction data
- **Connection management**: Centralized database connection handling with error recovery
- **Helper functions**: Abstracted database operations for user times, faction times, guild settings, and sticky messages
- **Atomic operations**: Increment functions to prevent data loss from concurrent voice channel updates

## Faction Management System
- **Role-based permissions**: Three hardcoded factions with designated leader roles for approval/denial of requests
- **Request system**: Temporary in-memory storage for pending faction join requests with leader approval workflow
- **Time tracking**: Individual and faction-wide voice channel time accumulation with MongoDB persistence
- **Achievement system**: Point-based achievements tied to voice time, battles, and bot interaction

## Voice Channel Tracking
- **Real-time monitoring**: Tracks voice channel join/leave events across all voice channels
- **Faction attribution**: Time automatically attributed to user's faction based on Discord roles
- **Session management**: Tracks individual sessions, longest sessions, and daily time accumulation
- **Clock-in notifications**: Optional channel notifications for voice activity with configurable channels

## Interactive Features
- **Faction battles**: Button-based battle system with participation tracking and victory calculations
- **Sticky messages**: Auto-reposting messages every N messages with style customization
- **Dropdown menus**: Faction selection interface using Discord's native select menus
- **Achievement tracking**: Comprehensive achievement system with points and unlockable rewards

## Command System
- **Modular design**: Commands stored as separate files with automatic loading
- **Permission checks**: Role-based and bot admin permission validation
- **Ephemeral responses**: Private responses for administrative commands and error messages
- **Rich embeds**: Faction-themed embeds with color coding and comprehensive information display

## Administrative Features
- **Bot admin system**: Separate admin role system independent of Discord permissions
- **Guild settings**: Per-server configuration for faction features, channels, and toggles
- **Bulk operations**: Admin commands for resetting times, managing sticky messages, and faction oversight
- **Debug tools**: Voice channel validation and system status checking

# External Dependencies

## Core Dependencies
- **discord.js (^14.22.1)**: Main Discord API wrapper for bot functionality and real-time events
- **mongodb (^5.8.0)**: Native MongoDB driver for persistent data storage and atomic operations
- **dotenv (^17.2.1)**: Environment variable management for secure configuration
- **express (^5.1.0)**: HTTP server for health checks and potential webhook integration

## Discord Platform Integration
- **Discord Gateway**: Real-time WebSocket connection for voice state updates and interactions
- **Discord REST API**: For role management, message sending, and guild information retrieval
- **Slash Commands**: Native Discord command interface with option validation and autocomplete
- **Required Discord permissions**: Guild access, voice state monitoring, role management, message management

## MongoDB Integration
- **Database collections**: userTimes, factionTimes, guildSettings, stickyMessages, botAdmins
- **Connection URI**: Configured via MONGO_URI environment variable
- **Error handling**: Connection retry logic and graceful degradation for database failures
- **Indexing considerations**: Optimized queries for user lookups and faction time aggregation