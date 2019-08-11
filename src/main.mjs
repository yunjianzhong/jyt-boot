// Copyright [2019] [patientdesperate@gmail.com]

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import ajax from './utils/ajax';
import config from '../config/config'
import inquirer from 'inquirer'
import request from './requests'
import dt from './utils/date'
import moment from 'moment'

let msleep = n => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

let sleep = n => {
  msleep(n*1000);
}

let printNow = () => {
  return moment().format("YYYY-MM-DD HH:mm:ss")
}

let sendSaveRequest = (startTime, data) => {
  console.log(printNow() + ' 查询号源中... ')
  request.check(data)
  .then(state => {
    if (state == "OK") {
      console.log(printNow() + ' 已有号源,抢号中... ')
      request.save(data)
      .then(orderNo => {
        console.log(printNow() + ' 恭喜！抢号成功！订单号：' + orderNo + '. 请在微信公众号京医通-个人中心-我的账户-挂号订单中继续支付! ')
      }).catch(error => {
        console.log(printNow() + ' 没挂上! ', error)
        sleep(1)
        sendSaveRequest(startTime, data)
      })
    }
  }).catch(error => {
    console.log(printNow() + ' 当前无号源! ', error)
    let now = moment()
    if (now.unix() - startTime.unix() > 30 ) {
      console.log(printNow() + ' 已重试多次,抢号失败！结束抢号... ')
    }else{
      sleep(1)
      sendSaveRequest(startTime, data)
    }
  })
}

let save = data => {
  inquirer.prompt([{
    type: 'input',
    name: 'startTime',
    message: '请输入放号时间,仅支持24小时内时间,格式为"YYYY-MM-DD HH:mm:ss"]\n:'   
  }]).then(ans => {
    let startTime = moment(ans.startTime, "YYYY-MM-DD HH:mm:ss")
    let now = moment()

    console.log("放号时间: " + startTime.format("YYYY-MM-DD HH:mm:ss"))    
    console.log("当前时间: " + now.format("YYYY-MM-DD HH:mm:ss"))

    let sleepTime = startTime.unix() - now.unix()
    if (sleepTime > 0 && sleepTime < 60*60*24) {
      console.log('距离放号时间还有' + sleepTime + '秒,将在放号前5秒开始抢号!')
      sleep(sleepTime - 5)
      now = moment()
      console.log('距离放号时间还有' + (startTime.unix() - now.unix())  + '秒,开始抢号!')
      
      sendSaveRequest(startTime, data)

    }else{
      console.log('放号时间仅支持24小时内,请确认是否输入正确!')
      save(data)
    }
  })
}

let data = {
  "price":null,
  "regHour":"",
  "orderProductType":""
}

console.log('+----------------------------------+')
console.log('|                                  |')
console.log('|  京医通挂号：开挂有风险，封号两行泪！  |')
console.log('|                                  |')
console.log('+----------------------------------+')
inquirer.prompt([
  {
    type: 'input',
    name: 'ucp',
    message: '输入UCP:'
  }
])
.then((ansUcp) => {
  request.setUcp(ansUcp.ucp)
  return request.getHosList()
})
.then(hosList => inquirer.prompt([
  {
    type: 'rawlist',
    name: 'hos',
    message: '选择医院:',
    paginated: true,
    choices: hosList.map(hos => ({name: hos.hosName, value: hos}))
  }]))
.then((ansHos) => {
  data.hosCode = ansHos.hos.hosCode
  console.log('选择了医院：', ansHos.hos.hosName)
  return request.getDeptList(data.hosCode).then(deptList => inquirer.prompt([
    {
      type: 'rawlist',
      name: 'dept',
      message: '选择部门:',
      paginated: true,
      choices: deptList.map(dept => ({name: dept.name, value: dept}))
    }
  ]))})
.then(ansDept => inquirer.prompt([
    {
      type: 'rawlist',
      name: 'subDept',
      message: '选择二级部门:',
      paginated: true,
      choices: ansDept.dept.subDepts.map(subDept => ({name: subDept.name, value: subDept}))
    }]))
.then(ansSubDept => {
      console.log('选择了部门:', ansSubDept.subDept.name)
      data.firstDeptCode = ansSubDept.subDept.deptCode
      data.firstDeptId = ansSubDept.subDept.deptId
      data.secondDeptCode = ansSubDept.subDept.subDeptCode
      data.secondDeptId = ansSubDept.subDept.subDeptId
      return request.getProductList(data.hosCode, data.firstDeptCode, data.secondDeptCode)
})
.then(dateList => inquirer.prompt([
          {
            type: 'rawlist',
            name: 'date',
            message: '选择日期:',
            paginated: true,
            choices: dateList.map(date => ({name: date.date + ': ' + date.status, value: date}))      
          }
]))
.then(ansDate => {
          data.treatmentDay = ansDate.date.date
          console.log('选择了日期:', ansDate.date.date)
          // 明天放号的日期是查不到科室的，用上周的日期替代查询
          let requestDate = ansDate.date.date
          if('TOMORROW_OPEN' == ansDate.date.status) {
            requestDate = dt.getLastWeekDay(ansDate.date.date)
          }
          return request.getProductDetail(data.hosCode, data.firstDeptCode, data.secondDeptCode, requestDate)
})
.then(productList => inquirer.prompt([
              {
                type: 'rawlist',
                name: 'product',
                message: '选择科室医生:',
                paginated: true,
                choices: productList.map(product => ({
                  name: product.doctorName + '/' + product.doctorTitle + '/' + product.timeType + '/' + product.status,
                  value: product}))
              }          
])).then(ansProduct => {
              let product = ansProduct.product
              // console.log('product: ', JSON.stringify(product))
              data.productId = product.id
              data.doctorId = product.doctorId
              data.productType = product.type
              data.productTimeType = product.timeType
              console.log('选择了：', product.doctorName + '/' + product.doctorTitle + '/' + product.timeType + '/' + product.status)
              return ansProduct
}).then(() => request.getUser())
.then(user => inquirer.prompt([{
  type: 'rawlist',
  name: 'card',
  message: '选择医保卡:',
  paginated: true,
  choices: user.cards.map(card => ({
    name: card.type + '/' + card.userName,
    value: card}))
}])).then(ans => {
  data.cardNo = ans.card.id
  console.log('选择了:', ans.card.type + '/' + ans.card.userName)
  return ans
})
.then(() => save(data))
.catch(error => console.log('粗错啦！', error, JSON.stringify(data)))