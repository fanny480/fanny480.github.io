#!/usr/bin/env python3
"""Generate lightweight GitHub public-profile signals for Mooncakes users.

This script only uses public GitHub profile/repository metadata. It writes
data/github-profiles.json for the static dashboard. The result should be treated
as a weak signal, not as verified personal information.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATISTICS_CSV = ROOT / "data" / "statistics.csv"
OUTPUT_JSON = ROOT / "data" / "github-profiles.json"
MAX_USERS = int(os.environ.get("MAX_GITHUB_PROFILE_USERS", "240"))
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")


def request_json(url: str):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "mooncakes-community-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code in {403, 404}:
            return None
        raise


def mooncakes_users() -> list[str]:
    if not STATISTICS_CSV.exists():
        return []

    first_seen: dict[str, str] = {}
    with STATISTICS_CSV.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            full_name = row.get("name") or row.get("pkg_name") or ""
            if "/" not in full_name:
                continue
            user = full_name.split("/", 1)[0].strip()
            created_at = row.get("created_at") or ""
            if not user:
                continue
            if user not in first_seen or created_at > first_seen[user]:
                first_seen[user] = created_at

    return [
        user
        for user, _created_at in sorted(first_seen.items(), key=lambda item: item[1], reverse=True)
    ][:MAX_USERS]


def top_repo_languages(login: str) -> list[str]:
    repos = request_json(
        f"https://api.github.com/users/{urllib.parse.quote(login)}/repos"
        "?type=owner&sort=updated&direction=desc&per_page=40"
    )
    if not isinstance(repos, list):
        return []

    counter: Counter[str] = Counter()
    for repo in repos:
        language = repo.get("language")
        if language:
            counter[language] += 1

    return [language for language, _count in counter.most_common(6)]


def occupation_signal(profile: dict, languages: list[str]) -> tuple[str, str]:
    text = " ".join(
        str(profile.get(key) or "")
        for key in ["bio", "company", "name"]
    ).lower()
    language_text = " ".join(languages).lower()

    rules = [
        (r"compiler|programming language|\bpl\b|type system|moonbit|ocaml", "Compiler / programming language developer", "medium"),
        (r"research|phd|professor|lab|university", "Researcher / academic", "medium"),
        (r"student|undergraduate|graduate", "Student", "medium"),
        (r"founder|ceo|cto|startup", "Founder / startup operator", "medium"),
        (r"designer|design", "Designer", "low"),
        (r"engineer|developer|software|programmer", "Software developer", "medium"),
    ]

    haystack = text + " " + language_text
    for pattern, label, confidence in rules:
        if re.search(pattern, haystack):
            return label, confidence

    if languages:
        return "Open-source developer", "low"
    return "To be confirmed", "low"


def profile_for(login: str) -> dict | None:
    profile = request_json(f"https://api.github.com/users/{urllib.parse.quote(login)}")
    if not isinstance(profile, dict):
        return None

    languages = top_repo_languages(login)
    occupation, confidence = occupation_signal(profile, languages)
    public_location = profile.get("location") or "To be confirmed"
    bio = profile.get("bio") or ""
    html_url = profile.get("html_url") or f"https://github.com/{login}"

    language_signal = " / ".join(languages) if languages else "To be confirmed"
    note_parts = ["Generated from public GitHub profile and public repositories."]
    if bio:
        note_parts.append("Bio: " + bio[:180])

    return {
        "github": html_url,
        "occupation": occupation,
        "public_location": public_location,
        "language_signal": language_signal,
        "inferred_region": public_location if public_location != "To be confirmed" else "Do not infer nationality from language alone",
        "confidence": confidence,
        "links": [html_url],
        "note": " ".join(note_parts),
        "source": "GitHub public profile and public repositories",
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def main() -> int:
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    result = {}
    for login in mooncakes_users():
        profile = profile_for(login)
        if profile:
            result[login] = profile

    OUTPUT_JSON.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(result)} GitHub profile annotations to {OUTPUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
