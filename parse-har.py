#!/usr/bin/env python3
import json
import sys
from urllib.parse import urlparse

def extract_failing_domains(har_file):
    with open(har_file, 'r') as f:
        har_data = json.load(f)

    failing_domains = set()
    failed_requests = []

    entries = har_data.get('log', {}).get('entries', [])

    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})

        url = request.get('url', '')
        status = response.get('status', 0)
        status_text = response.get('statusText', '')

        # Parse domain from URL
        parsed = urlparse(url)
        domain = parsed.netloc

        # Check for failures
        # Status -1 or 0 usually means network/DNS failure
        # Status >= 400 means HTTP error
        is_failed = False
        reason = ""

        if status == -1 or status == 0:
            is_failed = True
            reason = "DNS/Network failure"
        elif status >= 400:
            is_failed = True
            reason = f"HTTP {status} {status_text}"
        elif 'error' in status_text.lower():
            is_failed = True
            reason = status_text

        if is_failed and domain:
            failing_domains.add(domain)
            failed_requests.append({
                'url': url,
                'domain': domain,
                'status': status,
                'reason': reason
            })

    return failing_domains, failed_requests

if __name__ == '__main__':
    har_file = sys.argv[1] if len(sys.argv) > 1 else 'aistudio.google.com_Archive [25-12-12 08-36-17].har'

    domains, requests = extract_failing_domains(har_file)

    print("=" * 80)
    print("FAILING REQUESTS SUMMARY")
    print("=" * 80)
    print(f"\nTotal failing requests: {len(requests)}")
    print(f"Unique failing domains: {len(domains)}\n")

    if requests:
        print("FAILING REQUESTS:")
        print("-" * 80)
        for req in requests[:50]:  # Limit to first 50
            print(f"Domain: {req['domain']}")
            print(f"  URL: {req['url'][:100]}")
            print(f"  Status: {req['status']} - {req['reason']}")
            print()

    if domains:
        print("=" * 80)
        print("DOMAINS TO ADD TO WHITELIST:")
        print("=" * 80)
        for domain in sorted(domains):
            print(domain)
