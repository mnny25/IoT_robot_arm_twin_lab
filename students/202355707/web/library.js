'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let busy = false;
  function message(text, error = false) {
    $('library-status').textContent = text;
    $('library-status').classList.toggle('error', error);
  }
  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || '저장 API에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    return body;
  }
  async function refresh() {
    const { poses } = await request('/api/poses');
    const list = $('pose-list');
    list.replaceChildren();
    if (!poses.length) {
      const empty = document.createElement('li');
      empty.textContent = '아직 저장한 자세가 없어요. 마음에 드는 자세에 이름을 붙여 보세요.';
      list.append(empty);
    }
    poses.forEach(pose => {
      const row = document.createElement('li');
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = pose.name;
      const detail = document.createElement('small');
      detail.textContent = pose.angles.map((v, i) => `J${i + 1} ${Number(v).toFixed(1)}°`).join(' / ');
      info.append(title, detail);
      const actions = document.createElement('div');
      const load = document.createElement('button');
      load.textContent = '불러오기';
      load.type = 'button';
      load.addEventListener('click', () => {
        if (window.armLabPoses.load(pose.angles, pose.name)) message(`‘${pose.name}’ 자세로 이동합니다.`);
        else message('현재 자세에서 이동할 수 없는 경로예요. 홈 자세로 돌아간 뒤 다시 시도하세요.', true);
      });
      const remove = document.createElement('button');
      remove.textContent = '삭제';
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (busy) return;
        const token = $('admin-key').value;
        $('admin-key').value = '';
        if (!token) { message('삭제하려면 관리자 키를 입력하세요.', true); $('admin-key').focus(); return; }
        if (!window.confirm(`‘${pose.name}’ 자세를 삭제할까요?`)) return;
        busy = true;
        try {
          await request('/api/poses/' + pose.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
          await refresh();
          message('자세를 삭제했습니다.');
        } catch (error) { message(error.message, true); }
        finally { busy = false; }
      });
      actions.append(load, remove);
      row.append(info, actions);
      list.append(row);
    });
    $('pose-count').textContent = `${poses.length} / 100`;
  }
  $('pose-save-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    $('save-pose').disabled = true;
    message('자세를 저장하고 있어요.');
    try {
      await request('/api/poses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('pose-name').value.trim(), angles: window.armLabPoses.snapshot() }) });
      $('pose-name').value = '';
      await refresh();
      message('저장했어요! 다음에 접속해도 보관함에서 불러올 수 있어요.');
    } catch (error) { message(error.message, true); }
    finally { busy = false; $('save-pose').disabled = false; }
  });
  $('refresh-poses').addEventListener('click', () => refresh().then(() => message('보관함을 새로 불러왔습니다.')).catch(error => message(error.message, true)));
  refresh().then(() => message('마음에 드는 자세를 저장해 보세요. 보관함은 방문자 모두가 함께 사용합니다.')).catch(() => message('보관함에 연결하지 못했어요. 로봇암 체험은 계속 사용할 수 있습니다.', true));
})();
