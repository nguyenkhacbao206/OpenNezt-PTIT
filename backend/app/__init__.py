"""Real-Time Vietnamese <-> English Business Meeting Translator - backend package."""
import os

# CTranslate2 (offline NMT via NLLB *and* offline STT via faster-whisper) defaults
# to the Intel-MKL CPU backend, which fails with `mkl_malloc: failed to allocate
# memory` on some Windows/CPU/low-RAM setups even for a 600 MB int8 model. The
# oneDNN backend is robust, so disable MKL by default. Set CT2_USE_MKL=1 in the
# real environment to force MKL back on. MUST run before ctranslate2 is imported,
# hence here in the package __init__ (loaded before any provider).
os.environ.setdefault("CT2_USE_MKL", "0")
