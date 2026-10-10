"""Install the existing environment CA in one private Chromium TEST profile.

Chromium 151 ServerCertificate database uses CertificateMetadata protobuf:
https://github.com/chromium/chromium/blob/main/components/server_certificate_database/server_certificate_database.proto
No system/NSS store, HOME override or certificate-error bypass is used.
Initialize this disposable profile with Chromium once before running the tool.
"""
import argparse, hashlib, json, os, sqlite3, ssl
from pathlib import Path


def varint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def message(tag, data):
    return bytes([tag]) + varint(len(data)) + data


def prepare(profile):
    profile = Path(profile).resolve()
    if profile != Path('/workspace/.pitchlist-cloud/v3-browser-trust-isolated'):
        raise ValueError('dedicated_private_test_profile_required')
    if (profile / 'SingletonLock').exists() or (profile / 'SingletonLock').is_symlink():
        raise ValueError('close_test_browser_before_trust_setup')
    ca = Path('/usr/local/share/ca-certificates/environment-proxy-ca.crt')
    if os.environ.get('NODE_EXTRA_CA_CERTS') != str(ca):
        raise ValueError('existing_environment_ca_required')
    database = profile / 'Default/ServerCertificate'
    if not database.exists():
        raise ValueError('initialize_chromium_test_profile_first')
    profile.chmod(0o700)
    der = ssl.PEM_cert_to_DER_cert(ca.read_text())
    digest = hashlib.sha256(der).hexdigest()
    names = ['findpitches-v3-customer-preview.ctucker.workers.dev', '*.stripe.com', '*.stripe.network', '*.stripecdn.com']
    constraints = b''.join(message(0x0a, n.encode()) for n in names)
    # CertificateMetadata.trust.trust_type=TRUSTED (3), with DNS constraints.
    metadata = message(0x0a, b'\x08\x03') + message(0x12, constraints)
    with sqlite3.connect(database) as db:
        columns = [r[1] for r in db.execute('PRAGMA table_info(certificates)')]
        if columns != ['sha256hash_hex', 'der_cert', 'trust_settings']:
            raise ValueError('unsupported_chromium_certificate_schema')
        db.execute('INSERT OR REPLACE INTO certificates VALUES (?,?,?)', (digest, der, metadata))
    return {'schema': 'findpitches-v3-isolated-browser-trust-v1', 'profile_scope': 'dedicated_private_test_profile', 'system_trust_changed': False, 'certificate_bypass': False, 'proxy_ca_sha256': digest, 'dns_constraints': names}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.profile)))
