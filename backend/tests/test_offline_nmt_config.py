from app.core.config import Settings


def test_offline_nmt_defaults():
    s = Settings()
    assert s.offline_nmt_model_dir is None
    assert s.offline_nmt_beam_final == 4
    assert s.offline_nmt_beam_partial == 1
    assert s.offline_nmt_intra_threads == 0
