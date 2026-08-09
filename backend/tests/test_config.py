import pytest

from rentroo.config import CityConfig, get_city_config


def test_load_from_yaml(tmp_path):
    city_dir = tmp_path / "tokyo"
    city_dir.mkdir()
    (city_dir / "config.yaml").write_text(
        """
name: Tokyo
country: Japan
center: [35.68, 139.77]
bbox: [35.5, 139.3, 35.9, 140.0]
timezone: Asia/Tokyo
geocoder: gsi_photon
"""
    )
    config = CityConfig.load("tokyo", base_dir=tmp_path)
    assert config.slug == "tokyo"
    assert config.bbox == (35.5, 139.3, 35.9, 140.0)
    assert config.geocoder == "gsi_photon"
    assert config.commute_provider == "csa"  # default applies
    assert config.city_dir == city_dir


def test_missing_city_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        CityConfig.load("atlantis", base_dir=tmp_path)


def test_singleton_override(tokyo_config):
    assert get_city_config() is tokyo_config
