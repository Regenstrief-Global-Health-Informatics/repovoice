# RepoVoice Privacy Policy

**Operator:** OpenMRS Inc. (a 501(c)(3) nonprofit)  
**App:** RepoVoice  
**Contact:** paul@openmrs.org  
**Last updated:** 19 August 2026

RepoVoice is a free interview and reflection recorder. It is not an official clinical record and is not part of an OpenMRS server. This policy describes what the iOS app and the matching web app do with data.

## What the app collects

**On your device**

- Microphone audio you choose to record (interviews and reflections).
- Transcripts, notes, and who the take is linked to (a person slug you pick).
- Settings you type in: GitHub owner/repo/branch/folder, a GitHub personal access token, and optional xAI or OpenAI API keys.
- Audio lives in the on-device database (IndexedDB in the web app; the app sandbox on iOS). Settings live in on-device storage.

We do not run analytics, advertising, or crash telemetry in the app.

**What leaves the device (only if you turn it on)**

- **Speech-to-text:** if you set an xAI or OpenAI key and choose a cloud transcript mode, the audio for that take is sent to that provider so they can return a transcript. Browser/on-device speech recognition stays on the device.
- **GitHub:** if you set a token and a repo, the app uploads the audio file and a Markdown note/transcript to the repository and folder you chose.
- **Sign-in (hosted web only):** the hosted web build may use OpenMRS/Grok sign-in (for example Google). The iOS TestFlight build does not need that for recording.

OpenMRS Inc. does not receive your recordings, tokens, or API keys unless you push them to a GitHub repository the Inc. owns, or you send them to us on purpose.

## Who else sees the audio

Interviews often include other people’s voices. You are responsible for getting their consent before you record and before you push audio to GitHub. Treat a GitHub repo as a shared drive: anyone with access to that repo can hear the takes.

xAI and OpenAI process audio only when you supply a key and use their transcript mode. Their own privacy policies apply to that processing.

## What we do not do

- We do not sell data.
- We do not use recordings for advertising.
- We do not require an OpenMRS patient record or a medical server.
- We do not have a `--insecure` back door for your keys. Tokens stay in the settings you control. You can delete them in Settings, and you can delete takes from History (and from GitHub, if you already pushed).

## Your choices

- Record offline. Cloud STT and GitHub wait until you configure them and have a network.
- Use browser/on-device transcription only, and never set cloud keys.
- Delete takes on the device. Deleting on the device does not delete a copy you already committed to GitHub.
- Revoke the GitHub token and the xAI/OpenAI keys in those products at any time.

## Children

RepoVoice is not directed at children under 13.

## Changes

If this policy changes in a material way, we will update the date above and the copy at this URL.

## Contact

Questions or a deletion request: paul@openmrs.org, or OpenMRS Inc., Indianapolis, Indiana.
