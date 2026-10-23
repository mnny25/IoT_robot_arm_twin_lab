// ConfigMap으로 제공되는 교육용 모델 설정. 실제 로봇의 사양이 아닙니다.
window.ARM_LAB_CONFIG = Object.freeze({
  studentId: '202355707',
  nickname: '아리',
  color: 'peach',
  baseHeight: 0.65,
  upperArm: 1.8,
  forearm: 1.5,
  floorClearance: 0.15,
  speedDegreesPerSecond: 45,
  home: [25, 60, 75],
  presets: {
    ready: { label: '준비 자세', angles: [25, 60, 75] },
    reach: { label: '앞으로 뻗기', angles: [0, 30, 30] },
    pick: { label: '집기 접근', angles: [45, 45, 100] },
    place: { label: '옮기기', angles: [-65, 55, 95] }
  }
});
